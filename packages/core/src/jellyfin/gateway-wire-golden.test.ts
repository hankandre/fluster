// @vitest-environment node
// T2-04 acceptance item 5: the wire does not change when axios and the SDK leave. The baseline
// tests/fixtures/gateway-requests.json was recorded from the axios gateway on origin/main (01724f3c),
// before any change. This file replays the same scenarios through the new gateway and FetchTransport
// against a local server and expects, per request, the same method, path, raw query string, decoded
// query pairs in order, Authorization header and body text, byte for byte.
//
// trickplayTile is neither recorded nor replayed: T2-04 removes it (decision D5).
// The raw query string is compared as well as the decoded pairs, so FetchTransport reproduces axios's
// encoding (`:`, `$`, `,`, `[` and `]` bare, a space as `+`); the port itself still carries decoded pairs.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webCrypto } from "../adapters/web-crypto";
import { systemClock } from "../adapters/system-clock";
import { FetchTransport } from "../adapters/fetch-transport";
import { JellyfinGateway } from "./gateway";
import baseline from "../../tests/fixtures/gateway-requests.json";

// BEGIN SHARED (the recorder copies everything between these markers)
const playbackInfoFiles = import.meta.glob("../../tests/fixtures/jellyfin/*/playbackinfo-*.json", { eager: true, import: "default" }) as Record<string, unknown>;
const conversionFiles = import.meta.glob("../../tests/fixtures/jellyfin/*/conversion-*.json", { eager: true, import: "default" }) as Record<string, unknown>;

const INFO = { ServerName: "Golden", Version: "10.11.7", Id: "golden-server-id" };
const AUTHENTICATION = { AccessToken: "golden-access-token", User: { Id: "golden-user-id", Name: "golden-user" } };
const ACCOUNT = {
  Id: "golden-user-id",
  Name: "golden-user",
  Configuration: {
    AudioLanguagePreference: "eng",
    PlayDefaultAudioTrack: true,
    SubtitleLanguagePreference: "spa",
    SubtitleMode: "Default",
    EnableNextEpisodeAutoPlay: true,
    OrderedViews: ["view-1"],
  },
};

interface Captured {
  method: string;
  path: string;
  query: string;
  pairs: [string, string][];
  body: string | null;
  authorization: string;
}

type Setup = "none" | "connected" | "signed-in";
interface Scenario {
  name: string;
  setup: Setup;
  // The answers to PlaybackInfo, in order; the last one repeats.
  playbackInfo?: unknown[];
  run: (gateway: JellyfinGateway) => Promise<unknown>;
}

const servers: Server[] = [];
let captured: Captured[] = [];
let playbackInfoAnswers: unknown[] = [{}];
let playbackInfoCalls = 0;

async function listen(): Promise<string> {
  const server = createServer((request, response) => void handle(request, response));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function json(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const text = await readBody(request);
  const url = new URL(request.url ?? "/", "http://placeholder.invalid");
  const rawQuery = (request.url ?? "").includes("?") ? (request.url ?? "").slice((request.url ?? "").indexOf("?") + 1) : "";
  const method = request.method ?? "";
  captured.push({
    method,
    path: (request.url ?? "").split("?")[0],
    query: rawQuery,
    pairs: [...url.searchParams.entries()],
    body: text === "" ? null : text,
    authorization: String(request.headers.authorization ?? ""),
  });
  const route = `${method} ${url.pathname}`;
  if (route === "GET /System/Info/Public") return json(response, INFO);
  if (route === "GET /QuickConnect/Enabled") return json(response, true);
  if (route === "POST /QuickConnect/Initiate") return json(response, { Secret: "golden-qc-secret", Code: "123456" });
  if (route === "GET /QuickConnect/Connect") return json(response, { Authenticated: true });
  if (route === "POST /Users/AuthenticateByName" || route === "POST /Users/AuthenticateWithQuickConnect") return json(response, AUTHENTICATION);
  if (route === "GET /Users/Me") return json(response, ACCOUNT);
  if (route === "GET /Localization/Cultures" || route === "GET /Items/Latest" || route === "GET /Sessions") return json(response, []);
  if (method === "POST" && /^\/Items\/[^/]+\/PlaybackInfo$/.test(url.pathname)) {
    const answer = playbackInfoAnswers[Math.min(playbackInfoCalls, playbackInfoAnswers.length - 1)];
    playbackInfoCalls += 1;
    return json(response, answer);
  }
  if (method === "GET" && /^\/MediaSegments\//.test(url.pathname)) return json(response, { Items: [] });
  if (method === "GET") return json(response, { Items: [] });
  response.writeHead(204);
  response.end();
}

const ITEM = { id: "item-golden", name: "Golden", type: "Movie", resumePositionTicks: 0, played: false } as never;
const PLAN = { itemId: "item-golden", mediaSourceId: "source-golden", playSessionId: "play-session-golden", playMethod: "DirectPlay" } as never;
const SNAPSHOT = {
  positionSeconds: 12.5,
  paused: false,
  buffering: false,
  volume: 80.4,
  muted: false,
  audioTrack: 1,
  subtitleTrack: 2,
  tracks: [],
  diagnostics: {},
} as never;
const BROWSE = { itemTypes: ["Movie", "Series"], startIndex: 0, limit: 24, sortBy: "SortName", sortOrder: "Ascending", filters: ["IsUnplayed", "IsFavorite"], genreId: "genre-1" } as never;
const BROWSE_PAGE_2 = { itemTypes: ["Movie"], startIndex: 24, limit: 24, sortBy: "DateCreated", sortOrder: "Descending", filters: [] } as never;
const TRICKY_TERM = "a b+c&d=é:$,[x]/y?#z%";

function playbackScenario(name: string, itemId: string, answers: unknown[], run?: (gateway: JellyfinGateway) => Promise<unknown>): Scenario {
  const item = { id: itemId, name: "Golden", type: "Movie", resumePositionTicks: 0, played: false } as never;
  return { name, setup: "signed-in", playbackInfo: answers, run: run ?? ((gateway) => gateway.createPlaybackPlan(item)) };
}

function fixtureScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];
  const byKey = (files: Record<string, unknown>, kind: string) => {
    const entries = new Map<string, unknown>();
    for (const [path, value] of Object.entries(files)) {
      const match = new RegExp(`/jellyfin/([^/]+)/${kind}-(.+)\\.json$`).exec(path);
      if (match) entries.set(`${match[1]}/${kind}-${match[2]}`, value);
    }
    return entries;
  };
  for (const [kind, files] of [["playbackinfo", playbackInfoFiles], ["conversion", conversionFiles]] as const) {
    const entries = byKey(files, kind);
    for (const key of [...entries.keys()].sort()) {
      const [version, rest] = key.split("/");
      const name = rest.slice(kind.length + 1);
      const forced = entries.get(`${version}/${kind}-${name}-force-fallback`);
      const answers = [entries.get(key), ...(forced !== undefined && !name.endsWith("-force-fallback") ? [forced] : [])];
      const sources = ((entries.get(key) as { MediaSources?: { Id?: string }[] }).MediaSources ?? []);
      const sourceId = sources[0]?.Id;
      const pick = name.includes("audio-pick");
      scenarios.push(
        playbackScenario(key, `item-${name}`, answers, (gateway) =>
          gateway.createPlaybackPlan(
            { id: `item-${name}`, name: "Golden", type: "Movie", resumePositionTicks: 0, played: false } as never,
            0,
            undefined,
            pick ? sourceId : undefined,
            pick ? { audioStreamIndex: 1, keepDirectPlay: true } : {},
          ),
        ),
      );
    }
  }
  return scenarios;
}

const h264 = [...Object.entries(conversionFiles)].find(([path]) => path.endsWith("/10.11.7/conversion-h264.json"))?.[1];

const scenarios: Scenario[] = [
  { name: "connect", setup: "none", run: (g) => g.connect() },
  { name: "login", setup: "connected", run: (g) => g.login("golden-user", "golden-password") },
  { name: "quickConnectEnabled", setup: "connected", run: (g) => g.quickConnectEnabled() },
  { name: "initiateQuickConnect", setup: "connected", run: (g) => g.initiateQuickConnect() },
  { name: "pollQuickConnect", setup: "connected", run: (g) => g.pollQuickConnect("golden-qc-secret") },
  { name: "authenticateWithQuickConnect", setup: "connected", run: (g) => g.authenticateWithQuickConnect("golden-qc-secret") },
  { name: "logout", setup: "signed-in", run: (g) => g.logout() },
  { name: "userViews", setup: "signed-in", run: (g) => g.userViews() },
  { name: "resumeItems", setup: "signed-in", run: (g) => g.resumeItems() },
  { name: "nextUp", setup: "signed-in", run: (g) => g.nextUp() },
  { name: "recentlyPlayed", setup: "signed-in", run: (g) => g.recentlyPlayed() },
  { name: "similarItems", setup: "signed-in", run: (g) => g.similarItems("item/with slash") },
  { name: "itemCollections", setup: "signed-in", run: (g) => g.itemCollections("item-1") },
  { name: "collectionItems", setup: "signed-in", run: (g) => g.collectionItems("collection-1") },
  { name: "latestInLibrary", setup: "signed-in", run: (g) => g.latestInLibrary("library-1") },
  { name: "libraryGenres", setup: "signed-in", run: (g) => g.libraryGenres("library-1") },
  { name: "libraryItems", setup: "signed-in", run: (g) => g.libraryItems("library-1", BROWSE) },
  { name: "libraryItems (second page)", setup: "signed-in", run: (g) => g.libraryItems("library-1", BROWSE_PAGE_2) },
  { name: "searchHints", setup: "signed-in", run: (g) => g.searchHints("star wars") },
  { name: "searchHints (special characters)", setup: "signed-in", run: (g) => g.searchHints(TRICKY_TERM) },
  { name: "searchItems", setup: "signed-in", run: (g) => g.searchItems("star wars", { startIndex: 0, limit: 24 } as never) },
  { name: "searchItems (special characters)", setup: "signed-in", run: (g) => g.searchItems(TRICKY_TERM, { startIndex: 24, limit: 12 } as never) },
  { name: "seasons", setup: "signed-in", run: (g) => g.seasons("series-1") },
  { name: "seriesNextUp", setup: "signed-in", run: (g) => g.seriesNextUp("series-1") },
  { name: "episodes", setup: "signed-in", run: (g) => g.episodes("series-1", "season-1") },
  { name: "nextEpisode", setup: "signed-in", run: (g) => g.nextEpisode("series-1", "episode-1") },
  { name: "itemDetail", setup: "signed-in", run: (g) => g.itemDetail("item-1") },
  { name: "accountLanguages", setup: "signed-in", run: (g) => g.accountLanguages() },
  { name: "accountLanguageSettings", setup: "signed-in", run: (g) => g.accountLanguageSettings() },
  { name: "saveAccountLanguages", setup: "signed-in", run: (g) => g.saveAccountLanguages({ AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false }) },
  { name: "languageCultures", setup: "signed-in", run: (g) => g.languageCultures() },
  { name: "setPlayed (mark)", setup: "signed-in", run: (g) => g.setPlayed("item-1", true) },
  { name: "setPlayed (unmark)", setup: "signed-in", run: (g) => g.setPlayed("item-1", false) },
  { name: "setFavorite (mark)", setup: "signed-in", run: (g) => g.setFavorite("item-1", true) },
  { name: "setFavorite (unmark)", setup: "signed-in", run: (g) => g.setFavorite("item-1", false) },
  { name: "mediaSegments", setup: "signed-in", run: (g) => g.mediaSegments("item-1") },
  { name: "reportStart", setup: "signed-in", run: (g) => g.reportStart(PLAN, SNAPSHOT) },
  { name: "reportProgress", setup: "signed-in", run: (g) => g.reportProgress(PLAN, SNAPSHOT) },
  { name: "reportStopped", setup: "signed-in", run: (g) => g.reportStopped(PLAN, SNAPSHOT) },
  { name: "reportStopped (failed)", setup: "signed-in", run: (g) => g.reportStopped(PLAN, SNAPSHOT, undefined, true) },
  { name: "stopActiveEncoding", setup: "signed-in", run: (g) => g.stopActiveEncoding("play-session-golden") },
  { name: "sessionPlayMethod", setup: "signed-in", run: (g) => g.sessionPlayMethod(PLAN) },
  { ...playbackScenario("createPlaybackPlan (start position)", "item-golden", [h264], (g) => g.createPlaybackPlan(ITEM, 123_456_789)) },
  { ...playbackScenario("createPlaybackPlan (track indices, source)", "item-golden", [h264], (g) => g.createPlaybackPlan(ITEM, 0, undefined, "item-h264", { audioStreamIndex: 2, subtitleStreamIndex: -1 })) },
  { ...playbackScenario("createPlaybackPlan (play original)", "item-golden", [h264], (g) => g.createPlaybackPlan(ITEM, 0, undefined, undefined, { ignoreStreamingLimit: true })) },
  ...fixtureScenarios(),
];

let serverUrl: string | undefined;

async function drive(scenario: Scenario, makeGateway: (server: string) => JellyfinGateway): Promise<Captured[]> {
  const server = (serverUrl ??= await listen());
  captured = [];
  playbackInfoAnswers = scenario.playbackInfo ?? [{}];
  playbackInfoCalls = 0;
  const gateway = makeGateway(server);
  if (scenario.setup !== "none") await gateway.connect();
  if (scenario.setup === "signed-in") await gateway.login("golden-user", "golden-password");
  captured = [];
  // Only the requests matter here; what the gateway makes of the answers is tested elsewhere.
  await scenario.run(gateway).catch(() => undefined);
  return captured;
}
// END SHARED

function makeGateway(server: string): JellyfinGateway {
  const transport = new FetchTransport({ client: { version: "0.0.0", deviceName: "Octave" }, crypto: webCrypto, clock: systemClock });
  return new JellyfinGateway(server, webCrypto, transport, "install-1");
}

interface RecordedRequest {
  method: string;
  path: string;
  query: string;
  pairs: [string, string][];
  body: string | null;
  authorization: string;
}
const recorded = baseline as unknown as { bodies: Record<string, string>; scenarios: { name: string; requests: (Omit<RecordedRequest, "body"> & { body: string | null })[] }[] };

function expand(request: (typeof recorded.scenarios)[number]["requests"][number]): RecordedRequest {
  return { ...request, body: request.body === null ? null : recorded.bodies[request.body] };
}

afterAll(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("the recorded baseline", () => {
  it("covers every scenario of this file, and nothing else", () => {
    expect(recorded.scenarios.map((scenario) => scenario.name)).toEqual(scenarios.map((scenario) => scenario.name));
  });

  it("covers every playbackinfo and conversion fixture of Jellyfin 10.11.7 and 12.4.0", () => {
    const names = new Set(recorded.scenarios.map((scenario) => scenario.name));
    for (const files of [playbackInfoFiles, conversionFiles]) {
      for (const path of Object.keys(files)) {
        const match = /\/jellyfin\/([^/]+)\/([^/]+)\.json$/.exec(path);
        expect(names.has(`${match?.[1]}/${match?.[2]}`), path).toBe(true);
      }
    }
    expect([...names].some((name) => name.startsWith("10.11.7/"))).toBe(true);
    expect([...names].some((name) => name.startsWith("12.4.0/"))).toBe(true);
  });

  it("records no trickplayTile scenario and no address or port", () => {
    expect(recorded.scenarios.some((scenario) => /trickplay/i.test(scenario.name))).toBe(false);
    const text = JSON.stringify(recorded);
    expect(text).not.toMatch(/127\.0\.0\.1|localhost/);
  });
});

describe("the new gateway replays the recorded wire", () => {
  beforeAll(() => {
    captured = [];
  });

  it.each(scenarios.map((scenario) => [scenario.name, scenario] as const))("%s", async (_name, scenario) => {
    const expected = recorded.scenarios.find((entry) => entry.name === scenario.name);
    expect(expected, `no baseline for ${scenario.name}`).toBeDefined();
    const actual = await drive(scenario, makeGateway);
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.map((request) => `${request.method} ${request.path}`)).toEqual(expected!.requests.map((request) => `${request.method} ${request.path}`));
    expect(actual).toEqual(expected!.requests.map(expand));
  });
});
