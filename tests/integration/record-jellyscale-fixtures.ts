// Records the pinned Jellyscale's answers as contract fixtures (T2-08), run by hand and committed with its output.
//
//   tsx tests/integration/record-jellyscale-fixtures.ts              record the six fixture kinds
//   tsx tests/integration/record-jellyscale-fixtures.ts --endpoints  probe every endpoint the core calls, write endpoints.json
//   tsx tests/integration/record-jellyscale-fixtures.ts --check      probe again and compare with the committed endpoints.json
//
// Every catalog and PlaybackInfo call goes through JellyfinGateway over a recording wrapper of FetchTransport, so each
// request is exactly what the core sends. The raw sign-in and the endpoint probes are test tooling and send only the
// Authorization header, never a credential in a URL. Nothing here prints a token, a password or an authenticated URL.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FetchTransport } from "../../packages/core/src/adapters/fetch-transport";
import { systemClock } from "../../packages/core/src/adapters/system-clock";
import { webCrypto } from "../../packages/core/src/adapters/web-crypto";
import type { LibraryItem } from "../../packages/core/src/domain/catalog";
import { OCTAVE_PROFILE } from "../../packages/core/src/jellyfin/device-profile";
import { JellyfinGateway, PLAYBACK_INFO_FLAGS } from "../../packages/core/src/jellyfin/gateway";
import type { Transport, TransportRequest, TransportResponse } from "../../packages/core/src/ports/transport";
import { CLIENT, callStatus, makeSaver, makeScrubber, readCredentials, watchSignIns } from "./fixture-recording.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const composePath = join(here, "docker-compose.yml");
const fixturesRoot = join(here, "..", "..", "packages", "core", "tests", "fixtures", "jellyscale");
const DEVICE_ID = "octave-fixtures";

const sha = /^x-jellyscale-commit:\s*([0-9a-f]{40})\b/m.exec(readFileSync(composePath, "utf8"))?.[1];
if (!sha) throw new Error("docker-compose.yml has no x-jellyscale-commit of 40 hex characters");
const folder = sha.slice(0, 12);
const outDir = join(fixturesRoot, folder);

const mode = process.argv.includes("--check") ? "check" : process.argv.includes("--endpoints") ? "endpoints" : "record";

const credentials = readCredentials();
const base = credentials.jellyscale_url;
const username = credentials.jellyscale_username;
const password = credentials.jellyscale_password;
if (!base || !username || !password) throw new Error("tests/integration/.credentials has no jellyscale_* keys; run pnpm fixture:up and pnpm fixture:setup.");

interface Item {
  Id: string;
  Name: string;
  Type: string;
}

async function signIn(): Promise<{ token: string; body: any }> {
  const { status, data } = await callStatus(base, undefined, "POST", "/Users/AuthenticateByName", { body: { Username: username, Pw: password } });
  if (status !== 200 || typeof data?.AccessToken !== "string") throw new Error(`Jellyscale sign-in answered ${status}`);
  return { token: data.AccessToken, body: data };
}

// A raw request with the header only. It reads and drops the body; a Range keeps a media request to one byte.
async function hit(
  token: string,
  method: string,
  path: string,
  options: { query?: Record<string, string | number | boolean>; body?: unknown; range?: boolean } = {},
): Promise<{ status: number; data?: any }> {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    redirect: "manual",
    headers: {
      Authorization: `${CLIENT}, Token="${token}"`,
      "Content-Type": "application/json",
      ...(options.range ? { Range: "bytes=0-0" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data: unknown;
  try {
    data = text && !options.range ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  return { status: response.status, data };
}

// Drops the credential parameters a Jellyscale URL carries (docs/access.md): the header authenticates, never the URL.
function withoutCredentials(raw: string): { path: string; query: Record<string, string> } {
  const url = new URL(raw, base);
  const query: Record<string, string> = {};
  for (const [name, value] of url.searchParams) {
    if (!/^(api_?key|apitoken|token|accesstoken|access_token|x-emby-token)$/i.test(name)) query[name] = value;
  }
  return { path: url.pathname, query };
}

async function findItems(token: string): Promise<Item[]> {
  const { data } = await hit(token, "GET", "/Items", { query: { Recursive: true, IncludeItemTypes: "Movie,Series,Episode" } });
  return (data?.Items ?? []) as Item[];
}

function need(items: Item[], type: string, name: string): Item {
  const found = items.find((item) => item.Type === type && item.Name === name);
  if (!found) throw new Error(`Jellyscale lists no ${type} named ${name}; run pnpm fixture:setup.`);
  return found;
}

const asLibraryItem = (item: Item): LibraryItem => ({ id: item.Id, name: item.Name, type: "Movie", resumePositionTicks: 0, played: false });

// A Transport that copies each answer the gateway receives, so a scene can save the body the server sent.
class RecordingTransport implements Transport {
  readonly answers: { method: string; path: string; status: number; body: unknown }[] = [];
  constructor(private readonly inner: Transport) {}
  signIn: Transport["signIn"] = (request) => this.inner.signIn(request);
  endSession: Transport["endSession"] = (session, options) => this.inner.endSession(session, options);
  async request(request: TransportRequest): Promise<TransportResponse> {
    const response = await this.inner.request(request);
    this.answers.push({ method: request.method, path: request.path, status: response.status, body: response.body });
    return response;
  }
  last(method: string, path: string): unknown {
    const found = [...this.answers].reverse().find((answer) => answer.method === method && answer.path === path);
    if (!found) throw new Error(`the gateway made no ${method} ${path} call`);
    return found.body;
  }
}

async function record(): Promise<void> {
  const raw = await signIn();
  const secrets = [raw.token];
  // The gateway's own session has a token the core never sees; catch it as its sign-in answer passes.
  const stopWatching = watchSignIns(secrets);
  const items = await findItems(raw.token);
  const h264 = need(items, "Movie", "Synthetic H264");
  const multitrack = need(items, "Movie", "Synthetic Multitrack");
  const sidecar = need(items, "Movie", "Synthetic Sidecar");
  const views = (await hit(raw.token, "GET", "/UserViews")).data?.Items as { Id: string; Name: string }[];
  const moviesView = views.find((view) => view.Name === "Movies");
  const showsView = views.find((view) => view.Name === "Shows");
  if (!moviesView || !showsView) throw new Error("Jellyscale lists no Movies or Shows view.");
  const info = (await hit(raw.token, "GET", "/System/Info/Public")).data as { Id: string; ServerName?: string };

  const knownIds = new Map<string, string>([
    [h264.Id, "item-h264"],
    [multitrack.Id, "item-multitrack"],
    [sidecar.Id, "item-sidecar"],
    [moviesView.Id, "view-movies"],
    [showsView.Id, "view-shows"],
  ].map(([real, fake]) => [real.toLowerCase(), fake]));

  const transport = new RecordingTransport(new FetchTransport({ client: { version: "0", deviceName: "Octave Tests" }, crypto: webCrypto, clock: systemClock }));
  const gateway = new JellyfinGateway(base, webCrypto, transport, DEVICE_ID);
  // A second sign-in, through the transport, so the gateway holds a transport session. The raw one above is the
  // answer saved as signin-octave-test.json, because the transport hands the gateway a session id and no body.
  await gateway.login(username, password);
  stopWatching();
  if (secrets.length < 2) throw new Error("the gateway session's token was not captured; refusing to record.");

  mkdirSync(outDir, { recursive: true });
  const scrub = makeScrubber({
    tokens: secrets,
    host: new URL(base).host,
    fakeUserIds: [{ real: String(raw.body.User.Id).toLowerCase(), fake: "user-test" }],
    fakeServerId: { real: String(info.Id).toLowerCase(), fake: "server-jellyscale" },
    knownIds,
    serverNames: [info.ServerName ?? "Octave fixture"],
  });
  const save = makeSaver({ outDir, folder, scrub, secrets });

  save("signin-octave-test", raw.body);

  await gateway.userViews();
  save("userviews", transport.last("GET", "/UserViews"));

  await gateway.latestInLibrary(moviesView.Id);
  save("latest-movies", transport.last("GET", "/Items/Latest"));
  await gateway.latestInLibrary(showsView.Id);
  save("latest-shows", transport.last("GET", "/Items/Latest"));

  // A saved position on the H.264 film, then the resume list, then the position is cleared again.
  await hit(raw.token, "POST", `/UserItems/${h264.Id}/UserData`, { body: { PlaybackPositionTicks: 30000000 } });
  await gateway.resumeItems();
  save("resume-in-progress", transport.last("GET", "/UserItems/Resume"));
  await hit(raw.token, "POST", `/UserItems/${h264.Id}/UserData`, { body: { PlaybackPositionTicks: 0, Played: false } });

  for (const [item, file] of [[h264, "item-detail-h264"], [multitrack, "item-detail-multitrack"]] as const) {
    await gateway.itemDetail(item.Id);
    save(file, transport.last("GET", `/Items/${item.Id}`));
  }

  for (const [item, file] of [[h264, "playbackinfo-h264-profile"], [multitrack, "playbackinfo-multitrack-profile"], [sidecar, "playbackinfo-sidecar-profile"]] as const) {
    const plan = await gateway.createPlaybackPlan(asLibraryItem(item));
    save(file, transport.last("POST", `/Items/${item.Id}/PlaybackInfo`));
    // Result lines only: the delivery and the play method, never a URL.
    console.log(`  ${item.Name}: ${plan.delivery}, ${plan.playMethod}, ${plan.conversionReasons.length} conversion reasons`);
  }
  await gateway.logout();

  // A final sweep: no written file holds the raw token, as written or percent-encoded.
  for (const name of readdirSync(outDir).filter((entry) => entry.endsWith(".json"))) {
    const text = readFileSync(join(outDir, name), "utf8");
    for (const secret of secrets) {
      if (text.includes(secret) || text.includes(encodeURIComponent(secret))) throw new Error(`token found in ${name}`);
    }
  }
}

// ---- the endpoint inventory ----

interface DeclaredRoute {
  method: string;
  path: string;
  status: string;
}

function declaredRoutes(): DeclaredRoute[] {
  const run = spawnSync("docker", ["run", "--rm", `octave-jellyscale:${folder}`, "--print-routes"], { encoding: "utf8" });
  if (run.status !== 0) throw new Error("jellyscale --print-routes failed; run pnpm fixture:up first.");
  return [...run.stdout.matchAll(/\{method: (\w+), path: "([^"]+)", status: (\w+)/g)].map((match) => ({ method: match[1], path: match[2], status: match[3] }));
}

// The declared route for a core route: the same method, every segment equal or a declared placeholder, with the
// fewest placeholders winning, so /Videos/{itemId}/stream finds /Videos/{itemId}/{file}.
function declaredFor(declared: DeclaredRoute[], method: string, path: string): string | null {
  const mine = path.split("/");
  const matches = declared
    .filter((route) => route.method === method)
    .filter((route) => {
      const theirs = route.path.split("/");
      return theirs.length === mine.length && theirs.every((segment, at) => segment === mine[at] || (segment.startsWith("{") && segment.endsWith("}")) || (segment.includes("{") && mine[at].includes("{")));
    })
    .sort((a, b) => (a.path.match(/\{/g)?.length ?? 0) - (b.path.match(/\{/g)?.length ?? 0));
  return matches[0]?.status ?? null;
}

interface Row {
  method: string;
  path: string;
  declared: string | null;
  http: number | "not reached";
}

async function probe(): Promise<Row[]> {
  const declared = declaredRoutes();
  const first = await signIn();
  const token = first.token;
  const rows: Row[] = [];
  const add = (method: string, path: string, http: number | "not reached") => rows.push({ method, path, declared: declaredFor(declared, method, path), http });

  const items = await findItems(token);
  const h264 = need(items, "Movie", "Synthetic H264");
  const sidecar = need(items, "Movie", "Synthetic Sidecar");
  const series = need(items, "Series", "Synthetic Show");
  const views = ((await hit(token, "GET", "/UserViews")).data?.Items ?? []) as { Id: string; Name: string }[];
  const moviesView = views.find((view) => view.Name === "Movies");
  if (!moviesView) throw new Error("Jellyscale lists no Movies view.");
  const me = (await hit(token, "GET", "/Users/Me")).data;

  // Reads.
  add("GET", "/System/Info/Public", (await hit(token, "GET", "/System/Info/Public")).status);
  add("GET", "/Users/Me", (await hit(token, "GET", "/Users/Me")).status);
  add("GET", "/UserViews", (await hit(token, "GET", "/UserViews")).status);
  add("GET", "/UserItems/Resume", (await hit(token, "GET", "/UserItems/Resume")).status);
  add("GET", "/Items", (await hit(token, "GET", "/Items", { query: { Recursive: true, Limit: 1 } })).status);
  add("GET", "/Items/Latest", (await hit(token, "GET", "/Items/Latest", { query: { ParentId: moviesView.Id } })).status);
  add("GET", "/Items/{itemId}", (await hit(token, "GET", `/Items/${h264.Id}`)).status);
  add("GET", "/Items/{itemId}/Collections", (await hit(token, "GET", `/Items/${h264.Id}/Collections`)).status);
  add("GET", "/Items/{itemId}/Similar", (await hit(token, "GET", `/Items/${h264.Id}/Similar`)).status);
  add("GET", "/Items/{itemId}/Images/{imageType}", (await hit(token, "GET", `/Items/${h264.Id}/Images/Primary`, { range: true })).status);
  add("GET", "/Genres", (await hit(token, "GET", "/Genres", { query: { ParentId: moviesView.Id } })).status);
  add("GET", "/Search/Hints", (await hit(token, "GET", "/Search/Hints", { query: { searchTerm: "Synthetic", limit: 3 } })).status);
  add("GET", "/Shows/NextUp", (await hit(token, "GET", "/Shows/NextUp")).status);
  const seasons = await hit(token, "GET", `/Shows/${series.Id}/Seasons`);
  add("GET", "/Shows/{seriesId}/Seasons", seasons.status);
  add("GET", "/Shows/{seriesId}/Episodes", (await hit(token, "GET", `/Shows/${series.Id}/Episodes`, { query: { seasonId: seasons.data?.Items?.[0]?.Id ?? "" } })).status);
  add("GET", "/MediaSegments/{itemId}", (await hit(token, "GET", `/MediaSegments/${h264.Id}`)).status);
  add("GET", "/Localization/Cultures", (await hit(token, "GET", "/Localization/Cultures")).status);
  add("GET", "/Sessions", (await hit(token, "GET", "/Sessions", { query: { deviceId: DEVICE_ID } })).status);

  // Quick Connect: Initiate only when the server says it is enabled.
  const enabled = await hit(token, "GET", "/QuickConnect/Enabled");
  add("GET", "/QuickConnect/Enabled", enabled.status);
  if (enabled.data === true) {
    const initiated = await hit(token, "POST", "/QuickConnect/Initiate");
    add("POST", "/QuickConnect/Initiate", initiated.status);
    add("GET", "/QuickConnect/Connect", (await hit(token, "GET", "/QuickConnect/Connect", { query: { secret: String(initiated.data?.Secret ?? "") } })).status);
  } else {
    add("POST", "/QuickConnect/Initiate", "not reached");
    add("GET", "/QuickConnect/Connect", "not reached");
  }
  add("POST", "/Users/AuthenticateWithQuickConnect", "not reached");

  // PlaybackInfo, direct play: the same flags in the body and the query, with the Octave profile.
  const playbackInfo = (item: Item, flags: Record<string, boolean>) => {
    const query = { ...flags, UserId: me.Id, StartTimeTicks: 0, MaxStreamingBitrate: OCTAVE_PROFILE.MaxStreamingBitrate };
    return hit(token, "POST", `/Items/${item.Id}/PlaybackInfo`, { query, body: { ...query, DeviceProfile: OCTAVE_PROFILE } });
  };
  const direct = await playbackInfo(h264, { ...PLAYBACK_INFO_FLAGS });
  add("POST", "/Items/{itemId}/PlaybackInfo", direct.status);
  const source = direct.data?.MediaSources?.[0];
  const playSessionId = String(direct.data?.PlaySessionId ?? "");
  add("GET", "/Videos/{itemId}/stream", (await hit(token, "GET", `/Videos/${h264.Id}/stream`, { query: { Static: true, MediaSourceId: source?.Id ?? "", PlaySessionId: playSessionId }, range: true })).status);

  // Forced conversion: the master playlist, then the job is stopped with its real play session.
  const forced = await playbackInfo(h264, { ...PLAYBACK_INFO_FLAGS, EnableDirectPlay: false, EnableDirectStream: false });
  const transcodingUrl = forced.data?.MediaSources?.[0]?.TranscodingUrl;
  if (typeof transcodingUrl === "string" && transcodingUrl.includes("master.m3u8")) {
    const target = withoutCredentials(transcodingUrl);
    add("GET", "/Videos/{itemId}/master.m3u8", (await hit(token, "GET", target.path, { query: target.query })).status);
    const forcedSession = String(forced.data?.PlaySessionId ?? "");
    await hit(token, "POST", "/Sessions/Playing/Stopped", { body: { ItemId: h264.Id, MediaSourceId: forced.data.MediaSources[0].Id, PlaySessionId: forcedSession } });
    await hit(token, "DELETE", "/Videos/ActiveEncodings", { query: { deviceId: DEVICE_ID, playSessionId: forcedSession } });
  } else {
    add("GET", "/Videos/{itemId}/master.m3u8", "not reached");
  }

  // The sidecar subtitle's delivery path, fetched with the header only.
  const sidecarInfo = await playbackInfo(sidecar, { ...PLAYBACK_INFO_FLAGS });
  const external = (sidecarInfo.data?.MediaSources?.[0]?.MediaStreams ?? []).find((stream: any) => stream.IsExternal && typeof stream.DeliveryUrl === "string");
  if (external) {
    const target = withoutCredentials(external.DeliveryUrl);
    add("GET", "/Videos/{itemId}/{sourceId}/Subtitles/{index}/{file}", (await hit(token, "GET", target.path, { query: target.query })).status);
  } else {
    add("GET", "/Videos/{itemId}/{sourceId}/Subtitles/{index}/{file}", "not reached");
  }

  // Writes, each undone straight away.
  const userData = (await hit(token, "GET", `/Items/${h264.Id}`)).data?.UserData ?? {};
  add("POST", "/UserFavoriteItems/{itemId}", (await hit(token, "POST", `/UserFavoriteItems/${h264.Id}`)).status);
  add("DELETE", "/UserFavoriteItems/{itemId}", (await hit(token, "DELETE", `/UserFavoriteItems/${h264.Id}`)).status);
  add("POST", "/UserPlayedItems/{itemId}", (await hit(token, "POST", `/UserPlayedItems/${h264.Id}`)).status);
  add("DELETE", "/UserPlayedItems/{itemId}", (await hit(token, "DELETE", `/UserPlayedItems/${h264.Id}`)).status);
  if (userData.IsFavorite === true) await hit(token, "POST", `/UserFavoriteItems/${h264.Id}`);
  if (userData.Played === true) await hit(token, "POST", `/UserPlayedItems/${h264.Id}`);

  const playing = { ItemId: h264.Id, MediaSourceId: source?.Id, PlaySessionId: playSessionId, PositionTicks: 0, PlayMethod: "DirectPlay" };
  add("POST", "/Sessions/Playing", (await hit(token, "POST", "/Sessions/Playing", { body: playing })).status);
  add("POST", "/Sessions/Playing/Progress", (await hit(token, "POST", "/Sessions/Playing/Progress", { body: playing })).status);
  add("POST", "/Sessions/Playing/Stopped", (await hit(token, "POST", "/Sessions/Playing/Stopped", { body: playing })).status);
  add("DELETE", "/Videos/ActiveEncodings", (await hit(token, "DELETE", "/Videos/ActiveEncodings", { query: { deviceId: DEVICE_ID, playSessionId: "probe-session" } })).status);
  add("POST", "/Users/Configuration", (await hit(token, "POST", "/Users/Configuration", { body: me?.Configuration ?? {} })).status);

  // A second sign-in, logged out last.
  const second = await signIn();
  add("POST", "/Users/AuthenticateByName", 200);
  add("POST", "/Sessions/Logout", (await hit(second.token, "POST", "/Sessions/Logout")).status);

  return rows.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

const inventoryPath = join(outDir, "endpoints.json");
const ok = (value: number | "not reached"): boolean => typeof value === "number" && value >= 200 && value < 300;

async function main(): Promise<void> {
  if (mode === "record") {
    await record();
    return;
  }
  const rows = await probe();
  if (mode === "endpoints") {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(inventoryPath, JSON.stringify({ pin: sha, recorded: new Date().toISOString().slice(0, 10), routes: rows }, null, 2) + "\n");
    console.log(`  wrote ${folder}/endpoints.json (${rows.length} routes, ${rows.filter((row) => ok(row.http)).length} answered with 2xx)`);
    return;
  }
  if (!existsSync(inventoryPath)) throw new Error(`no ${folder}/endpoints.json to check against`);
  const committed = (JSON.parse(readFileSync(inventoryPath, "utf8")) as { routes: Row[] }).routes;
  const differences: string[] = [];
  for (const row of rows) {
    const before = committed.find((entry) => entry.method === row.method && entry.path === row.path);
    if (!before) differences.push(`${row.method} ${row.path}: not in endpoints.json`);
    else if (before.declared !== row.declared || ok(before.http) !== ok(row.http)) {
      differences.push(`${row.method} ${row.path}: declared ${String(before.declared)} -> ${String(row.declared)}, http ${String(before.http)} -> ${String(row.http)}`);
    }
  }
  for (const entry of committed) {
    if (!rows.some((row) => row.method === entry.method && row.path === entry.path)) differences.push(`${entry.method} ${entry.path}: no longer probed`);
  }
  if (differences.length > 0) {
    for (const line of differences) console.error(`[check-jellyscale] ${line}`);
    process.exit(1);
  }
  console.log(`[check-jellyscale] ${rows.length} routes match endpoints.json`);
}

main().catch((error: unknown) => {
  // A message only: never the error object, which could carry a request.
  console.error(`[record-jellyscale] ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
});
