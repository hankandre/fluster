// @vitest-environment node
// T2-04 acceptance item 6: a canary token appears in no thrown error, log call or redacted output. A local
// server issues a canary as the AccessToken and echoes it, raw and percent-encoded, in bodies, in a
// PlaybackInfo TranscodingUrl and subtitle DeliveryUrl, in 401 and 500 answers and in a redirect Location;
// connections are reset and hang until a FakeClock fires the timeout. The run signs in, makes every gateway
// call and signs out, and every place the canary could surface is scanned for it: raw, percent-encoded up to
// four rounds, and base64. The table is keyed by gateway method name; scripts/core-transport-deps.test.ts
// checks that every public gateway method has a row.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { diagnosticsText } from "./diagnostics";
import { redactError, redactText } from "./redact";
import { classifyTransportError, redactTransportError } from "./transport-error";
import { SignInFailure } from "./domain/sign-in-failure";
import { FakeClock } from "./ports/fake-clock";
import { TransportError, type SignInRequest, type SignInResult, type Transport, type TransportRequest, type TransportResponse } from "./ports/transport";
import { FetchTransport } from "./adapters/fetch-transport";
import { systemClock } from "./adapters/system-clock";
import { webCrypto } from "./adapters/web-crypto";
import { JellyfinGateway } from "./jellyfin/gateway";

// Characters that percent-encoding and base64 change: + / = and a non-ASCII letter.
const CANARY = "canary-TOKEN+/=é-9f3a1c7e";
const ENCODED = encodeURIComponent(CANARY);

// ---------------------------------------------------------------------------------------------------------
// The scanner.

function variants(): string[] {
  const found = new Set<string>();
  let text = CANARY;
  found.add(text);
  for (let round = 0; round < 4; round += 1) {
    text = encodeURIComponent(text);
    found.add(text);
    found.add(text.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase()));
  }
  const base64 = Buffer.from(CANARY, "utf8").toString("base64");
  found.add(base64);
  found.add(base64.replace(/=+$/, ""));
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_");
  found.add(urlSafe);
  found.add(urlSafe.replace(/=+$/, ""));
  return [...found];
}
const VARIANTS = variants();

function holdsCanary(text: string): boolean {
  return VARIANTS.some((variant) => text.includes(variant));
}

// A path to the first canary reachable from `root` through own properties (enumerable or not), `cause`, array
// items, Map keys and values and Set members, or undefined when there is none.
function findCanary(root: unknown, label = "value"): string | undefined {
  const seen = new WeakSet<object>();
  const visit = (value: unknown, path: string): string | undefined => {
    if (typeof value === "string") return holdsCanary(value) ? path : undefined;
    if (typeof value !== "object" || value === null || seen.has(value)) return undefined;
    seen.add(value);
    if (value instanceof Error) {
      for (const text of [value.name, value.message, value.stack ?? "", String(value)]) {
        if (holdsCanary(text)) return `${path} (error text)`;
      }
    }
    if (value instanceof URL && holdsCanary(value.href)) return `${path} (url)`;
    if (value instanceof Map) {
      for (const [key, entry] of value) {
        const hit = visit(key, `${path}.<map key>`) ?? visit(entry, `${path}.<map value>`);
        if (hit) return hit;
      }
    } else if (value instanceof Set) {
      for (const entry of value) {
        const hit = visit(entry, `${path}.<set member>`);
        if (hit) return hit;
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "string" && holdsCanary(key)) return `${path}.<key ${key}>`;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && "value" in descriptor) {
        const hit = visit(descriptor.value, `${path}.${String(key)}`);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return visit(root, label);
}

describe("the canary scanner", () => {
  const planted: [string, () => unknown][] = [
    ["an error message", () => new Error(`failed with ${CANARY}`)],
    ["an error stack", () => Object.assign(new Error("x"), { stack: `Error: x\n at ${CANARY}` })],
    ["an own property of an error", () => Object.assign(new Error("x"), { detail: { deep: [CANARY] } })],
    ["an error cause", () => new Error("x", { cause: new Error(CANARY) })],
    ["a non-enumerable property", () => Object.defineProperty({}, "hidden", { value: CANARY, enumerable: false })],
    ["a console.warn argument list", () => ["Server logout failed", CANARY]],
    ["a Map value", () => new Map([["a", CANARY]])],
    ["a Map key", () => new Map([[CANARY, "a"]])],
    ["a Set member", () => new Set([CANARY])],
    ["a redacted output string", () => redactText(`GET /x failed for ${CANARY}`)],
    ["a returned value", () => ({ cards: [{ title: `Movie ${CANARY}` }] })],
    [
      "a TypeScript private field",
      () => {
        class Holder {
          private token = CANARY;
          reveal(): string {
            return this.token;
          }
        }
        return { transport: new Holder() };
      },
    ],
    ["a percent-encoded copy", () => ({ url: `/x?ApiKey=${ENCODED}` })],
    ["a copy encoded twice", () => ({ url: encodeURIComponent(ENCODED) })],
    ["a copy encoded four times", () => ({ url: encodeURIComponent(encodeURIComponent(encodeURIComponent(encodeURIComponent(CANARY)))) })],
    ["a base64 copy", () => ({ blob: Buffer.from(CANARY).toString("base64") })],
  ];

  it.each(planted)("finds a canary planted in %s", (_name, build) => {
    expect(findCanary(build())).toBeDefined();
  });

  it("does not flag a value without the canary, a marker, or a cyclic structure", () => {
    const cyclic: Record<string, unknown> = { name: "safe", marker: "[redacted]" };
    cyclic.self = cyclic;
    expect(findCanary(cyclic)).toBeUndefined();
    expect(findCanary(new Error("Jellyfin did not respond."))).toBeUndefined();
    expect(findCanary(new Map([["k", "v"]]))).toBeUndefined();
  });

  it("does not see a value held in an ECMAScript private field (the property the adapter must have)", () => {
    class Hidden {
      #token = CANARY;
      reveal(): string {
        return this.#token;
      }
    }
    expect(findCanary({ transport: new Hidden() })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------
// The server.

type Mode = "ok" | "unauthorized" | "server-error" | "redirect" | "reset" | "hang";
let mode: Mode = "ok";
let onHang: (() => void) | undefined;
const received: string[] = [];
const servers: Server[] = [];

function jsonResponse(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const ECHO = { Echo: CANARY, EchoEncoded: ENCODED };

function playbackInfo(): unknown {
  return {
    ...ECHO,
    PlaySessionId: "play-1",
    MediaSources: [
      {
        Id: "source-1",
        Container: "mkv",
        SupportsDirectPlay: false,
        SupportsDirectStream: false,
        SupportsTranscoding: true,
        TranscodingSubProtocol: "hls",
        TranscodingUrl: `/videos/item-1/master.m3u8?MediaSourceId=source-1&ApiKey=${ENCODED}&PlaySessionId=play-1&Echo=${CANARY}`,
        MediaStreams: [
          { Type: "Video", Index: 0, Codec: "h264" },
          {
            Type: "Subtitle",
            Index: 2,
            Codec: "srt",
            IsExternal: true,
            DeliveryMethod: "External",
            DeliveryUrl: `/Videos/item-1/source-1/Subtitles/2/0/Stream.srt?ApiKey=${ENCODED}&Echo=${CANARY}`,
          },
        ],
      },
    ],
  };
}

function okBody(method: string, path: string): unknown {
  switch (`${method} ${path}`) {
    case "GET /System/Info/Public":
      return { ...ECHO, ServerName: "Home", Version: "10.11.7", Id: "server-1" };
    case "GET /QuickConnect/Enabled":
      return true;
    case "POST /QuickConnect/Initiate":
      return { ...ECHO, Secret: "qc-secret", Code: "123456" };
    case "GET /QuickConnect/Connect":
      return { ...ECHO, Authenticated: true };
    case "GET /Users/Me":
      return { ...ECHO, Id: "user-1", Name: "Louise", Configuration: { AudioLanguagePreference: "eng" } };
    case "GET /Localization/Cultures":
    case "GET /Items/Latest":
      return [];
    case "GET /Sessions":
      return [{ ...ECHO, Id: "session-x", DeviceId: "device-x" }];
    default:
      if (method === "POST" && /\/PlaybackInfo$/.test(path)) return playbackInfo();
      return { ...ECHO, Items: [{ Id: "item-1", Name: `Movie ${CANARY}`, Type: "Movie", Overview: ENCODED }], TotalRecordCount: 1 };
  }
}

function handle(request: IncomingMessage, response: ServerResponse): void {
  request.resume();
  received.push(String(request.headers.authorization ?? ""));
  const url = new URL(request.url ?? "/", "http://placeholder.invalid");
  const method = request.method ?? "";
  const signIn = method === "POST" && url.pathname.startsWith("/Users/Authenticate");
  switch (mode) {
    case "unauthorized":
      return jsonResponse(response, 401, { Message: `Invalid token ${CANARY}`, Token: ENCODED });
    case "server-error":
      response.writeHead(500, { "content-type": "text/plain" });
      return void response.end(`Unhandled exception for token ${CANARY} (${ENCODED})`);
    case "redirect":
      response.writeHead(302, { location: `http://127.0.0.1:1/final?ApiKey=${ENCODED}&raw=${CANARY}` });
      return void response.end();
    case "reset":
      return void request.socket.destroy();
    case "hang":
      onHang?.();
      return;
    default:
      if (signIn) return jsonResponse(response, 200, { ...ECHO, AccessToken: CANARY, User: { Id: "user-1", Name: "Louise" } });
      if (method === "POST" && url.pathname === "/Sessions/Logout") {
        response.writeHead(204);
        return void response.end();
      }
      if (method !== "GET" && !/PlaybackInfo$/.test(url.pathname) && url.pathname !== "/QuickConnect/Initiate") {
        response.writeHead(204);
        return void response.end();
      }
      return jsonResponse(response, 200, okBody(method, url.pathname));
  }
}

async function listen(): Promise<string> {
  const server = createServer(handle);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// ---------------------------------------------------------------------------------------------------------
// The calls.

const PLAN = { itemId: "item-1", mediaSourceId: "source-1", playSessionId: "play-1", playMethod: "Transcode" } as never;
const SNAPSHOT = { positionSeconds: 1, paused: false, buffering: false, volume: 50, muted: false, audioTrack: 1, subtitleTrack: 2, tracks: [], diagnostics: {} } as never;
const ITEM = { id: "item-1", name: "Item", type: "Movie", resumePositionTicks: 0, played: false } as never;
const BROWSE = { itemTypes: ["Movie"], startIndex: 0, limit: 24, sortBy: "SortName", sortOrder: "Ascending", filters: [] } as never;

type Call = (gateway: JellyfinGateway) => Promise<unknown>;

const calls: Record<string, Call> = {
  "connect": (g) => g.connect(),
  "login": (g) => g.login("Louise", "hunter2"),
  "quickConnectEnabled": (g) => g.quickConnectEnabled(),
  "initiateQuickConnect": (g) => g.initiateQuickConnect(),
  "pollQuickConnect": (g) => g.pollQuickConnect("qc-secret"),
  "authenticateWithQuickConnect": (g) => g.authenticateWithQuickConnect("qc-secret"),
  "logout": (g) => g.logout(),
  "userViews": (g) => g.userViews(),
  "resumeItems": (g) => g.resumeItems(),
  "nextUp": (g) => g.nextUp(),
  "recentlyPlayed": (g) => g.recentlyPlayed(),
  "similarItems": (g) => g.similarItems("item-1"),
  "itemCollections": (g) => g.itemCollections("item-1"),
  "collectionItems": (g) => g.collectionItems("collection-1"),
  "latestInLibrary": (g) => g.latestInLibrary("library-1"),
  "libraryGenres": (g) => g.libraryGenres("library-1"),
  "libraryItems": (g) => g.libraryItems("library-1", BROWSE),
  "searchHints": (g) => g.searchHints("term"),
  "searchItems": (g) => g.searchItems("term", { startIndex: 0, limit: 24 } as never),
  "seasons": (g) => g.seasons("series-1"),
  "seriesNextUp": (g) => g.seriesNextUp("series-1"),
  "episodes": (g) => g.episodes("series-1", "season-1"),
  "nextEpisode": (g) => g.nextEpisode("series-1", "episode-1"),
  "itemDetail": (g) => g.itemDetail("item-1"),
  "accountLanguages": (g) => g.accountLanguages(),
  "accountLanguageSettings": (g) => g.accountLanguageSettings(),
  "saveAccountLanguages": (g) => g.saveAccountLanguages({ SubtitleMode: "None" }),
  "languageCultures": (g) => g.languageCultures(),
  "setPlayed": async (g) => {
    await g.setPlayed("item-1", true);
    await g.setPlayed("item-1", false);
  },
  "setFavorite": async (g) => {
    await g.setFavorite("item-1", true);
    await g.setFavorite("item-1", false);
  },
  "mediaSegments": (g) => g.mediaSegments("item-1"),
  "createPlaybackPlan": (g) => g.createPlaybackPlan(ITEM),
  "reportStart": (g) => g.reportStart(PLAN, SNAPSHOT),
  "reportProgress": (g) => g.reportProgress(PLAN, SNAPSHOT),
  "reportStopped": (g) => g.reportStopped(PLAN, SNAPSHOT),
  "stopActiveEncoding": (g) => g.stopActiveEncoding("play-1"),
  "sessionPlayMethod": (g) => g.sessionPlayMethod(PLAN),
};

const PRE_SIGN_IN_CALLS = ["connect", "quickConnectEnabled", "initiateQuickConnect", "pollQuickConnect"];

// ---------------------------------------------------------------------------------------------------------
// The run.

const errors: unknown[] = [];
const returned: unknown[] = [];
const logged: unknown[][] = [];
const outputs: unknown[] = [];
const gateways: JellyfinGateway[] = [];
let serverUrl = "";

function newGateway(clock = systemClock as ConstructorParameters<typeof FetchTransport>[0]["clock"]): JellyfinGateway {
  const transport = new FetchTransport({ client: { version: "0.1.0", deviceName: "Octave Test" }, crypto: webCrypto, clock });
  const gateway = new JellyfinGateway(serverUrl, webCrypto, transport, "install-1");
  gateways.push(gateway);
  return gateway;
}

async function attempt(promise: Promise<unknown>): Promise<void> {
  try {
    returned.push(await promise);
  } catch (error) {
    errors.push(error);
  }
}

async function signedInGateway(clock?: ConstructorParameters<typeof FetchTransport>[0]["clock"]): Promise<JellyfinGateway> {
  mode = "ok";
  const gateway = newGateway(clock);
  await gateway.connect();
  await gateway.login("Louise", "hunter2");
  return gateway;
}

async function happyRun(): Promise<void> {
  mode = "ok";
  const gateway = newGateway();
  for (const name of PRE_SIGN_IN_CALLS) await attempt(calls[name](gateway));
  await attempt(calls.authenticateWithQuickConnect(gateway));
  for (const name of Object.keys(calls)) {
    if (PRE_SIGN_IN_CALLS.includes(name) || ["authenticateWithQuickConnect", "login", "logout"].includes(name)) continue;
    await attempt(calls[name](gateway));
  }
  gateways.push(gateway);
  await attempt(calls.logout(gateway));
  await attempt(calls.login(gateway));
}

async function failureRun(failure: Mode): Promise<void> {
  const gateway = await signedInGateway();
  mode = failure;
  for (const name of Object.keys(calls)) {
    if (name === "logout") continue;
    await attempt(calls[name](gateway));
  }
  await attempt(calls.logout(gateway));
}

async function hungCall(gateway: JellyfinGateway, clock: FakeClock, name: string): Promise<void> {
  mode = "hang";
  const arrived = new Promise<void>((resolve) => {
    onHang = resolve;
  });
  const pending = attempt(calls[name](gateway));
  await arrived;
  // The adapter registered its timeout before the request went out.
  expect(clock.pending(), name).toBeGreaterThan(0);
  await clock.advance(20_000);
  await pending;
}

async function timeoutRun(): Promise<void> {
  const clock = new FakeClock();
  const gateway = await signedInGateway(clock);
  for (const name of ["userViews", "reportProgress", "createPlaybackPlan", "stopActiveEncoding", "login", "authenticateWithQuickConnect", "logout"]) {
    await hungCall(gateway, clock, name);
    mode = "ok";
    if (name === "logout") break;
  }
  const probeGateway = newGateway(clock);
  await hungCall(probeGateway, clock, "connect");
  mode = "ok";
}

function collectOutputs(): void {
  for (const error of errors) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? "") : "";
    outputs.push(redactText(message), redactText(stack), redactError(error), redactTransportError(error));
    outputs.push(
      diagnosticsText({
        appVersion: message,
        os: stack,
        player: { kind: "native", libmpvVersion: message, renderer: stack },
        decode: { mode: "software", hwdec: message },
        serverVersion: message,
        hostClass: "loopback",
      }),
    );
  }
}

const warn = vi.spyOn(console, "warn");
const consoleSpies = (["error", "log", "info", "debug", "trace"] as const).map((method) => vi.spyOn(console, method));

beforeAll(async () => {
  for (const spy of [warn, ...consoleSpies]) spy.mockImplementation((...args: unknown[]) => void logged.push(args));
  serverUrl = await listen();
  await happyRun();
  for (const failure of ["unauthorized", "server-error", "redirect", "reset"] as const) await failureRun(failure);
  await timeoutRun();
  mode = "ok";
  collectOutputs();
}, 120_000);

afterAll(async () => {
  for (const spy of [warn, ...consoleSpies]) spy.mockRestore();
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    }),
  );
});

afterEach(() => {
  mode = "ok";
});

describe("the canary run is not vacuous", () => {
  it("sent the canary to the server in the Authorization header, percent-encoded", () => {
    expect(received.some((header) => header.includes(`Token="${ENCODED}"`))).toBe(true);
    expect(received.some((header) => header.includes(`Token=""`))).toBe(true);
  });

  it("collected failures of every kind and results from the happy path", () => {
    const codes = errors.map((error) => (error as { code?: unknown } | null)?.code);
    expect(codes).toContain("network");
    expect(codes).toContain("timeout");
    expect(codes).toContain("status");
    const statuses = errors.map((error) => (error as { status?: unknown } | null)?.status);
    expect(statuses).toContain(401);
    expect(statuses).toContain(500);
    expect(errors.some((error) => error instanceof SignInFailure && error.kind === "redirect")).toBe(true);
    expect(errors.length).toBeGreaterThan(60);
    expect(returned.length).toBeGreaterThan(30);
    expect(returned.some((value) => Array.isArray(value) && value.length > 0)).toBe(true);
  });

  it("logged the failed sign-outs", () => {
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.every((args) => args[0] === "Server logout failed; the local session was cleared.")).toBe(true);
  });
});

describe("a canary token appears nowhere", () => {
  it("in any thrown error: message, name, stack, own and nested properties, cause", () => {
    expect(errors.map((error, index) => findCanary(error, `errors[${index}]`)).find(Boolean)).toBeUndefined();
  });

  it("in any console call", () => {
    expect(findCanary(logged, "console")).toBeUndefined();
  });

  it("in the output of redactText, redactError, redactTransportError and diagnosticsText over those failures", () => {
    expect(outputs.length).toBeGreaterThan(errors.length * 4);
    expect(findCanary(outputs, "outputs")).toBeUndefined();
  });

  it("in any value the gateway returned", () => {
    expect(findCanary(returned, "returned")).toBeUndefined();
  });

  it("in a deep walk of the gateway and everything it reaches, Maps and Sets included", () => {
    for (const [index, gateway] of gateways.entries()) expect(findCanary(gateway, `gateways[${index}]`)).toBeUndefined();
    expect(JSON.stringify(gateways[0], (_key, value: unknown) => (typeof value === "bigint" ? String(value) : value))).not.toContain(CANARY);
  });

  it("in the transport's own enumerable surface", () => {
    const transport = (gateways[0] as unknown as { transport?: unknown }).transport;
    expect(transport).toBeDefined();
    expect(findCanary(transport, "transport")).toBeUndefined();
    expect(Object.getOwnPropertyNames(transport)).not.toContain("token");
  });
});

// ---------------------------------------------------------------------------------------------------------
// An adapter that attaches context to its error (a native bridge, a future transport): the gateway still drops it.

class LeakyTransport implements Transport {
  async signIn(_request: SignInRequest): Promise<SignInResult> {
    throw leak();
  }

  async request(_request: TransportRequest): Promise<TransportResponse> {
    throw leak();
  }

  async endSession(): Promise<void> {
    throw leak();
  }
}

class SignedInLeaky extends LeakyTransport {
  override async signIn(): Promise<SignInResult> {
    return { session: "session-1", userId: "user-1", userName: "Louise", serverId: "server-1" };
  }
}

function leak(): TransportError {
  return Object.assign(new TransportError("status", 500), {
    config: { headers: { Authorization: `MediaBrowser Token="${ENCODED}"` }, url: `/x?ApiKey=${ENCODED}` },
    request: { url: `/x?ApiKey=${ENCODED}`, headers: { Authorization: CANARY } },
    response: { status: 500, data: CANARY, config: { headers: { Authorization: CANARY } } },
    cause: new Error(`socket closed for ${CANARY}`),
  });
}

describe("an error that carries config, request, response and cause", () => {
  async function failureOf(promise: Promise<unknown>): Promise<Error> {
    return promise.then(
      () => {
        throw new Error("expected a failure");
      },
      (error: unknown) => error as Error,
    );
  }

  it("is rebuilt by the gateway with none of them, and keeps its code and status", async () => {
    const gateway = new JellyfinGateway("https://media.test", webCrypto, new SignedInLeaky(), "install-1");
    await gateway.login("Louise", "hunter2");
    const error = await failureOf(gateway.userViews());

    for (const field of ["config", "request", "response", "cause"]) expect(field in error, field).toBe(false);
    expect(findCanary(error)).toBeUndefined();
    expect((error as { code?: unknown }).code).toBe("status");
    // The axios-shaped response.status is gone; the status is on the error itself.
    expect((error as { status?: unknown }).status).toBe(500);
    expect(classifyTransportError(error)).toBe("server");
  });

  it("is rebuilt the same way on sign-in", async () => {
    const gateway = new JellyfinGateway("https://media.test", webCrypto, new LeakyTransport(), "install-1");
    const error = await failureOf(gateway.login("Louise", "hunter2"));
    for (const field of ["config", "request", "response", "cause"]) expect(field in error, field).toBe(false);
    expect(findCanary(error)).toBeUndefined();
    expect((error as { code?: unknown }).code).toBe("status");
  });

  it("is dropped from the sign-out warning", async () => {
    warn.mockClear();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, new SignedInLeaky(), "install-1");
    await gateway.login("Louise", "hunter2");
    await gateway.logout();
    expect(warn).toHaveBeenCalled();
    expect(findCanary(warn.mock.calls)).toBeUndefined();
  });

  it("is dropped by redactTransportError itself", () => {
    const redacted = redactTransportError(leak());
    for (const field of ["config", "request", "response", "cause"]) expect(field in (redacted as object), field).toBe(false);
    expect(findCanary(redacted)).toBeUndefined();
    expect((redacted as { status?: unknown }).status).toBe(500);
  });
});
