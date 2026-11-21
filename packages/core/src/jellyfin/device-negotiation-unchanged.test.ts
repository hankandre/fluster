// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { FetchTransport } from "../adapters/fetch-transport";
import { systemClock } from "../adapters/system-clock";
import { webCrypto } from "../adapters/web-crypto";
import type { PlayerCapabilities } from "../domain/player-engine";
import baseline from "../../tests/fixtures/gateway-requests.json";
import { EVERYTHING, listOf, withoutH264 } from "./device-test-support";
import { JellyfinGateway } from "./gateway";

// T2-07 item 4: a source the device can play never causes the second request. The scenarios are the ones the frozen
// gateway-wire-golden.test.ts builds in fixtureScenarios() (item id `item-<name>`, a `-force-fallback` sibling as the
// second answer, and for the audio-pick names the first source's id with { audioStreamIndex: 1, keepDirectPlay: true }),
// served by a real HTTP server with the same server and user ids and one install id. Only the PlaybackInfo requests
// are compared with the recorded baseline: method, path, raw query, pairs, body text and Authorization header.
const playbackInfoFiles = import.meta.glob("../../tests/fixtures/jellyfin/*/playbackinfo-*.json", { eager: true, import: "default" }) as Record<string, unknown>;
const conversionFiles = import.meta.glob("../../tests/fixtures/jellyfin/*/conversion-*.json", { eager: true, import: "default" }) as Record<string, unknown>;

const INFO = { ServerName: "Golden", Version: "10.11.7", Id: "golden-server-id" };
const AUTHENTICATION = { AccessToken: "golden-access-token", User: { Id: "golden-user-id", Name: "golden-user" } };
const ACCOUNT = { Id: "golden-user-id", Name: "golden-user", Configuration: { AudioLanguagePreference: "eng", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "spa", SubtitleMode: "Default", EnableNextEpisodeAutoPlay: true, OrderedViews: ["view-1"] } };

interface Captured {
  method: string;
  path: string;
  query: string;
  pairs: [string, string][];
  body: string | null;
  authorization: string;
}

const servers: Server[] = [];
let captured: Captured[] = [];
let answers: unknown[] = [{}];
let calls = 0;

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  const url = new URL(request.url ?? "/", "http://placeholder.invalid");
  const raw = request.url ?? "";
  const method = request.method ?? "";
  captured.push({
    method,
    path: raw.split("?")[0],
    query: raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "",
    pairs: [...url.searchParams.entries()],
    body: text === "" ? null : text,
    authorization: String(request.headers.authorization ?? ""),
  });
  const reply = (body: unknown) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const route = `${method} ${url.pathname}`;
  if (route === "GET /System/Info/Public") return reply(INFO);
  if (route === "POST /Users/AuthenticateByName") return reply(AUTHENTICATION);
  if (route === "GET /Users/Me") return reply(ACCOUNT);
  if (method === "POST" && /^\/Items\/[^/]+\/PlaybackInfo$/.test(url.pathname)) {
    const answer = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    return reply(answer);
  }
  if (method === "GET") return reply({ Items: [] });
  response.writeHead(204);
  response.end();
}

let serverUrl: string | undefined;
async function listen(): Promise<string> {
  const server = createServer((request, response) => void handle(request, response));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterAll(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

type Source = PlayerCapabilities | "full" | "default";

interface Scenario {
  name: string;
  answers: unknown[];
  itemId: string;
  pick: boolean;
  sourceId?: string;
}

function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const [kind, files] of [["playbackinfo", playbackInfoFiles], ["conversion", conversionFiles]] as const) {
    const entries = new Map<string, unknown>();
    for (const [path, value] of Object.entries(files)) {
      const match = new RegExp(`/jellyfin/([^/]+)/${kind}-(.+)\\.json$`).exec(path);
      if (match) entries.set(`${match[1]}/${kind}-${match[2]}`, value);
    }
    for (const key of [...entries.keys()].sort()) {
      const [version, rest] = key.split("/");
      const name = rest.slice(kind.length + 1);
      const forced = entries.get(`${version}/${kind}-${name}-force-fallback`);
      const first = entries.get(key) as { MediaSources?: { Id?: string }[] };
      out.push({
        name: key,
        answers: [first, ...(forced !== undefined && !name.endsWith("-force-fallback") ? [forced] : [])],
        itemId: `item-${name}`,
        pick: name.includes("audio-pick"),
        sourceId: first.MediaSources?.[0]?.Id,
      });
    }
  }
  return out;
}

async function drive(scenario: Scenario, source: Source): Promise<Captured[]> {
  const server = (serverUrl ??= await listen());
  answers = scenario.answers;
  calls = 0;
  captured = [];
  const transport = new FetchTransport({ client: { version: "0.0.0", deviceName: "Octave" }, crypto: webCrypto, clock: systemClock });
  const capabilities = source === "default" ? undefined : { get: () => source };
  const gateway = new JellyfinGateway(server, webCrypto, transport, "install-1", undefined, undefined, capabilities as never);
  await gateway.connect();
  await gateway.login("golden-user", "golden-password");
  captured = [];
  const item = { id: scenario.itemId, name: "Golden", type: "Movie", resumePositionTicks: 0, played: false } as never;
  await gateway
    .createPlaybackPlan(item, 0, undefined, scenario.pick ? scenario.sourceId : undefined, scenario.pick ? { audioStreamIndex: 1, keepDirectPlay: true } : {})
    .catch(() => undefined);
  return captured.filter((request) => request.method === "POST" && /\/Items\/[^/]+\/PlaybackInfo$/.test(request.path));
}

const recorded = baseline as unknown as { bodies: Record<string, string>; scenarios: { name: string; requests: (Omit<Captured, "body"> & { body: string | null })[] }[] };

function expected(name: string): Captured[] {
  const entry = recorded.scenarios.find((scenario) => scenario.name === name);
  expect(entry, `no baseline for ${name}`).toBeDefined();
  return entry!.requests
    .filter((request) => request.method === "POST" && /\/Items\/[^/]+\/PlaybackInfo$/.test(request.path))
    .map((request) => ({ ...request, body: request.body === null ? null : recorded.bodies[request.body] }));
}

const all = scenarios();

describe("T2-07 item 4: the rebuilt scenarios are the ones the baseline holds", () => {
  it("covers every recorded Jellyfin playbackinfo and conversion scenario", () => {
    expect(all.length).toBeGreaterThan(50);
    for (const scenario of all) expect(expected(scenario.name).length, scenario.name).toBeGreaterThan(0);
  });
});

describe.each([
  ["no capability source", "default"],
  ['the "full" capability source', "full"],
  ["a complete list that can play every recorded codec", EVERYTHING],
] as const)("T2-07 item 4: with %s", (_label, source) => {
  it.each(all.map((scenario) => [scenario.name, scenario] as const))("sends exactly the requests sent before this change: %s", async (_name, scenario) => {
    const actual = await drive(scenario, source);
    expect(actual).toEqual(expected(scenario.name));
  });
});

describe("T2-07 item 4: the control, a device that cannot play the source", () => {
  it.each(["10.11.7/conversion-h264", "12.4.0/conversion-h264", "10.11.7/conversion-hevc-hdr10", "12.4.0/conversion-av1"])(
    "sends the same first request and then one more for %s",
    async (name) => {
      const scenario = all.find((entry) => entry.name === name)!;
      const codecBlocked: PlayerCapabilities = name.includes("h264") ? withoutH264 : listOf(["h264"], ["aac", "ac3"]);
      const actual = await drive({ ...scenario, answers: [scenario.answers[0]] }, codecBlocked);
      const before = expected(name);
      expect(actual).toHaveLength(2);
      expect(actual[0]).toEqual(before[0]);
      expect(JSON.parse(actual[1].body ?? "{}")).toMatchObject({ EnableDirectPlay: false, AllowVideoStreamCopy: false });
    },
  );
});

const here = dirname(fileURLToPath(import.meta.url));
const composePath = join(here, "../../../../tests/integration/docker-compose.yml");
const pinDir = (): string => {
  const sha = /^x-jellyscale-commit:\s*([0-9a-f]{40})\b/m.exec(readFileSync(composePath, "utf8"))?.[1];
  if (!sha) throw new Error("docker-compose.yml has no x-jellyscale-commit of 40 hex characters");
  return join(here, "../../tests/fixtures/jellyscale", sha.slice(0, 12));
};

describe("T2-07 item 4: the pinned Jellyscale's first answers", () => {
  const files = (): string[] => readdirSync(pinDir()).filter((name) => name.startsWith("playbackinfo-") && name.endsWith(".json")).sort();

  it("has the three first answers", () => {
    expect(files()).toEqual(["playbackinfo-h264-profile.json", "playbackinfo-multitrack-profile.json", "playbackinfo-sidecar-profile.json"]);
  });

  it.each([
    ["full", "full"],
    ["a complete list that can play them", EVERYTHING],
  ] as const)("sends one request for each under %s", async (_label, source) => {
    for (const file of files()) {
      const answer = JSON.parse(readFileSync(join(pinDir(), file), "utf8")) as { MediaSources: { Id: string }[] };
      const actual = await drive({ name: file, answers: [answer], itemId: answer.MediaSources[0].Id, pick: false }, source);
      expect(actual, file).toHaveLength(1);
      expect(JSON.parse(actual[0].body ?? "{}"), file).toMatchObject({ EnableDirectPlay: true, AllowVideoStreamCopy: true });
    }
  });
});
