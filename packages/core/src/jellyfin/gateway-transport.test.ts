// @vitest-environment node
// T2-04 acceptance item 1: the gateway reaches the server only through the Transport port (decision 0005):
// signIn, request and endSession. No header and no absolute URL cross it, the gateway holds an opaque session id
// and no token. The table below is keyed by gateway method name; scripts/core-transport-deps.test.ts checks
// that every public gateway method has a row here, in gateway-redirect-port.test.ts and in
// transport-canary.test.ts.
import { describe, expect, it } from "vitest";
import { ItemNotFoundError } from "../domain/catalog";
import { SignInFailure } from "../domain/sign-in-failure";
import { classifyTransportError } from "../transport-error";
import {
  PRE_SIGN_IN_ROUTES,
  TransportError,
  type SignInRequest,
  type SignInResult,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from "../ports/transport";
import { webCrypto } from "../adapters/web-crypto";
import { CONTROL_REQUEST_TIMEOUT_MS, JellyfinGateway, REPORT_REQUEST_TIMEOUT_MS } from "./gateway";

type Event =
  | { kind: "signIn"; request: SignInRequest }
  | { kind: "request"; request: TransportRequest }
  | { kind: "endSession"; session: string; options: { timeoutMs: number } };

class RecordingTransport implements Transport {
  readonly events: Event[] = [];
  answers = new Map<string, TransportResponse>();
  signInResult: SignInResult = { session: "session-1", userId: "user-1", userName: "Louise", serverId: "server-1" };
  signInError?: Error;

  async signIn(request: SignInRequest): Promise<SignInResult> {
    this.events.push({ kind: "signIn", request });
    if (this.signInError) throw this.signInError;
    return this.signInResult;
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    this.events.push({ kind: "request", request });
    return this.answers.get(`${request.method} ${request.path}`) ?? { status: 200, body: answerFor(request) };
  }

  async endSession(session: string, options: { timeoutMs: number }): Promise<void> {
    this.events.push({ kind: "endSession", session, options });
  }

  get requests(): TransportRequest[] {
    return this.events.flatMap((event) => (event.kind === "request" ? [event.request] : []));
  }
}

function answerFor(request: TransportRequest): unknown {
  switch (`${request.method} ${request.path}`) {
    case "GET /System/Info/Public":
      return { ServerName: "Home", Version: "10.11.7", Id: "server-1" };
    case "GET /QuickConnect/Enabled":
      return true;
    case "POST /QuickConnect/Initiate":
      return { Secret: "qc-secret", Code: "123456" };
    case "GET /QuickConnect/Connect":
      return { Authenticated: true };
    case "GET /Users/Me":
      return { Id: "user-1", Configuration: {} };
    case "GET /Localization/Cultures":
    case "GET /Items/Latest":
    case "GET /Sessions":
      return [];
    default:
      return { Items: [], MediaSources: [], PlaySessionId: "play-1" };
  }
}

const PLAN = { itemId: "item-1", mediaSourceId: "source-1", playSessionId: "play-1", playMethod: "DirectPlay" } as never;
const SNAPSHOT = { positionSeconds: 1, paused: false, buffering: false, volume: 50, muted: false, audioTrack: 1, subtitleTrack: 2, tracks: [], diagnostics: {} } as never;
const ITEM = { id: "item-1", name: "Item", type: "Movie", resumePositionTicks: 0, played: false } as never;
const BROWSE = { itemTypes: ["Movie"], startIndex: 0, limit: 24, sortBy: "SortName", sortOrder: "Ascending", filters: ["IsUnplayed"] } as never;

type Call = (gateway: JellyfinGateway, signal?: AbortSignal) => Promise<unknown>;

const calls: Record<string, Call> = {
  "connect": (g, s) => g.connect(s),
  "login": (g, s) => g.login("Louise", "hunter2", s),
  "quickConnectEnabled": (g, s) => g.quickConnectEnabled(s),
  "initiateQuickConnect": (g, s) => g.initiateQuickConnect(s),
  "pollQuickConnect": (g, s) => g.pollQuickConnect("qc-secret", s),
  "authenticateWithQuickConnect": (g, s) => g.authenticateWithQuickConnect("qc-secret", s),
  "logout": (g) => g.logout(),
  "userViews": (g, s) => g.userViews(s),
  "resumeItems": (g, s) => g.resumeItems(s),
  "nextUp": (g, s) => g.nextUp(s),
  "recentlyPlayed": (g, s) => g.recentlyPlayed(s),
  "similarItems": (g, s) => g.similarItems("item-1", s),
  "itemCollections": (g, s) => g.itemCollections("item-1", s),
  "collectionItems": (g, s) => g.collectionItems("collection-1", s),
  "latestInLibrary": (g, s) => g.latestInLibrary("library-1", s),
  "libraryGenres": (g, s) => g.libraryGenres("library-1", s),
  "libraryItems": (g, s) => g.libraryItems("library-1", BROWSE, s),
  "searchHints": (g, s) => g.searchHints("term", s),
  "searchItems": (g, s) => g.searchItems("term", { startIndex: 0, limit: 24 } as never, s),
  "seasons": (g, s) => g.seasons("series-1", s),
  "seriesNextUp": (g, s) => g.seriesNextUp("series-1", s),
  "episodes": (g, s) => g.episodes("series-1", "season-1", s),
  "nextEpisode": (g, s) => g.nextEpisode("series-1", "episode-1", s),
  "itemDetail": (g, s) => g.itemDetail("item-1", s),
  "accountLanguages": (g, s) => g.accountLanguages(s),
  "accountLanguageSettings": (g, s) => g.accountLanguageSettings(s),
  "saveAccountLanguages": (g) => g.saveAccountLanguages({ AudioLanguagePreference: "fra" }),
  "languageCultures": (g, s) => g.languageCultures(s),
  "setPlayed": async (g, s) => {
    await g.setPlayed("item-1", true, s);
    await g.setPlayed("item-1", false, s);
  },
  "setFavorite": async (g, s) => {
    await g.setFavorite("item-1", true, s);
    await g.setFavorite("item-1", false, s);
  },
  "mediaSegments": (g, s) => g.mediaSegments("item-1", s),
  "createPlaybackPlan": (g, s) => g.createPlaybackPlan(ITEM, 0, s),
  "reportStart": (g, s) => g.reportStart(PLAN, SNAPSHOT, s),
  "reportProgress": (g, s) => g.reportProgress(PLAN, SNAPSHOT, s),
  "reportStopped": (g, s) => g.reportStopped(PLAN, SNAPSHOT, s),
  "stopActiveEncoding": (g, s) => g.stopActiveEncoding("play-1", s),
  "sessionPlayMethod": (g, s) => g.sessionPlayMethod(PLAN, s),
};

const SIGN_IN_ROUTES = new Set(["POST /Users/AuthenticateByName", "POST /Users/AuthenticateWithQuickConnect", "POST /Sessions/Logout"]);
const ALLOWED_KEYS = new Set(["target", "method", "path", "query", "body", "timeoutMs", "signal"]);
const PRE_SIGN_IN = new Set<string>(PRE_SIGN_IN_ROUTES);

async function quiet(promise: Promise<unknown>): Promise<void> {
  await promise.catch(() => undefined);
}

// Pre-sign-in calls, a Quick Connect sign-in, every signed-in call, sign-out, then a password sign-in.
async function driveEverything(gateway: JellyfinGateway, transport: RecordingTransport): Promise<Map<string, number>> {
  const reached = new Map<string, number>();
  const run = async (name: string) => {
    const before = transport.events.length;
    await quiet(calls[name](gateway));
    reached.set(name, transport.events.length - before);
  };
  for (const name of ["connect", "quickConnectEnabled", "initiateQuickConnect", "pollQuickConnect", "authenticateWithQuickConnect"]) await run(name);
  for (const name of Object.keys(calls)) {
    if (["connect", "quickConnectEnabled", "initiateQuickConnect", "pollQuickConnect", "authenticateWithQuickConnect", "login", "logout"].includes(name)) continue;
    await run(name);
  }
  await run("logout");
  await run("login");
  return reached;
}

describe("the gateway and the Transport port", () => {
  it("sends every call as signIn, request or endSession", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    const reached = await driveEverything(gateway, transport);

    expect(new Set(transport.events.map((event) => event.kind))).toEqual(new Set(["signIn", "request", "endSession"]));
    for (const [name, count] of reached) expect(count, `${name} sent nothing`).toBeGreaterThan(0);
    expect([...reached.keys()].sort()).toEqual(Object.keys(calls).sort());
  });

  it("builds each request object from target, method, path, query, body, timeoutMs and signal only", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await driveEverything(gateway, transport);

    expect(transport.requests.length).toBeGreaterThan(30);
    for (const request of transport.requests) {
      expect(Object.keys(request).every((key) => ALLOWED_KEYS.has(key)), `${request.method} ${request.path}`).toBe(true);
      expect(request.path.startsWith("/")).toBe(true);
      expect(request.path).not.toMatch(/[?#]/);
      expect(request.path).not.toMatch(/^\/\//);
      expect(["GET", "POST", "DELETE"]).toContain(request.method);
      expect(request.timeoutMs).toBeGreaterThan(0);
      for (const pair of request.query ?? []) {
        expect(Array.isArray(pair)).toBe(true);
        expect(pair).toHaveLength(2);
        expect(typeof pair[0]).toBe("string");
        expect(typeof pair[1]).toBe("string");
      }
      if (request.method === "GET") expect(request.body).toBeUndefined();
    }
  });

  it("names the server and DeviceId only on the pre-sign-in routes and the session everywhere after sign-in", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await driveEverything(gateway, transport);

    let signedIn = false;
    const preSignInSeen = new Set<string>();
    for (const event of transport.events) {
      if (event.kind === "signIn") signedIn = true;
      if (event.kind === "endSession") signedIn = false;
      if (event.kind !== "request") continue;
      const { target, method, path } = event.request;
      if ("session" in target) {
        expect(Object.keys(target)).toEqual(["session"]);
        expect(target.session).toBe("session-1");
        expect(signedIn, `${method} ${path} named a session before sign-in`).toBe(true);
      } else {
        expect(Object.keys(target).sort()).toEqual(["deviceId", "server"]);
        expect(target.server).toBe("https://media.test");
        expect(typeof target.deviceId).toBe("string");
        expect(PRE_SIGN_IN.has(`${method} ${path}`), `${method} ${path} is not a pre-sign-in route`).toBe(true);
        preSignInSeen.add(`${method} ${path}`);
      }
    }
    expect(preSignInSeen).toEqual(PRE_SIGN_IN);
  });

  it("never sends the sign-in or sign-out routes through request", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await driveEverything(gateway, transport);

    for (const request of transport.requests) expect(SIGN_IN_ROUTES.has(`${request.method} ${request.path}`)).toBe(false);
    const signIns = transport.events.flatMap((event) => (event.kind === "signIn" ? [event.request] : []));
    expect(signIns.map((request) => request.credential.kind)).toEqual(["quick-connect", "password"]);
    expect(signIns[0].credential).toEqual({ kind: "quick-connect", secret: "qc-secret" });
    expect(signIns[1].credential).toEqual({ kind: "password", username: "Louise", password: "hunter2" });
    expect(signIns.every((request) => request.server === "https://media.test" && request.deviceId.length > 0)).toBe(true);
    expect(transport.events.filter((event) => event.kind === "endSession")).toEqual([
      { kind: "endSession", session: "session-1", options: { timeoutMs: REPORT_REQUEST_TIMEOUT_MS } },
    ]);
  });

  it("keeps a reverse-proxy base path in the server it hands to the transport", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test/jellyfin/", webCrypto, transport, "install-1");
    await gateway.connect();
    await gateway.login("Louise", "hunter2");
    const signIn = transport.events.find((event) => event.kind === "signIn");
    expect(signIn?.kind === "signIn" && signIn.request.server).toBe("https://media.test/jellyfin");
    const probe = transport.requests[0];
    expect("server" in probe.target && probe.target.server).toBe("https://media.test/jellyfin");
    expect(probe.path).toBe("/System/Info/Public");
  });

  it("passes the control timeout, the report timeout and the caller's signal", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await gateway.login("Louise", "hunter2");
    const controller = new AbortController();

    await quiet(gateway.userViews(controller.signal));
    await quiet(gateway.reportProgress(PLAN, SNAPSHOT, controller.signal));
    await quiet(gateway.stopActiveEncoding("play-1", controller.signal));
    await quiet(gateway.sessionPlayMethod(PLAN, controller.signal));
    await quiet(gateway.createPlaybackPlan(ITEM, 0, controller.signal));

    const byPath = (path: string) => transport.requests.find((request) => request.path === path);
    expect(byPath("/UserViews")).toMatchObject({ timeoutMs: CONTROL_REQUEST_TIMEOUT_MS, signal: controller.signal });
    expect(byPath("/Sessions/Playing/Progress")).toMatchObject({ timeoutMs: REPORT_REQUEST_TIMEOUT_MS, signal: controller.signal });
    expect(byPath("/Videos/ActiveEncodings")).toMatchObject({ method: "DELETE", timeoutMs: REPORT_REQUEST_TIMEOUT_MS, signal: controller.signal });
    expect(byPath("/Sessions")).toMatchObject({ timeoutMs: REPORT_REQUEST_TIMEOUT_MS, signal: controller.signal });
    expect(byPath("/Items/item-1/PlaybackInfo")).toMatchObject({ method: "POST", timeoutMs: CONTROL_REQUEST_TIMEOUT_MS, signal: controller.signal });
    const signIn = transport.events.find((event) => event.kind === "signIn");
    expect(signIn?.kind === "signIn" && signIn.request.timeoutMs).toBe(CONTROL_REQUEST_TIMEOUT_MS);
  });

  it("sends the media-segment types as two query pairs, not in the path", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await gateway.login("Louise", "hunter2");
    await quiet(gateway.mediaSegments("item-1"));
    expect(transport.requests[0]).toMatchObject({
      method: "GET",
      path: "/MediaSegments/item-1",
      query: [["includeSegmentTypes", "Intro"], ["includeSegmentTypes", "Outro"]],
    });
  });

  it("sends decoded query pairs in order, with the PlaybackInfo flags in the body and the query", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await gateway.login("Louise", "hunter2");
    await quiet(gateway.searchHints("a b&c"));
    await quiet(gateway.createPlaybackPlan(ITEM, 5));

    const search = transport.requests.find((request) => request.path === "/Search/Hints");
    expect(search?.query).toEqual([
      ["userId", "user-1"],
      ["searchTerm", "a b&c"],
      ["limit", "8"],
      ["includeItemTypes", "Movie,Series,Episode"],
    ]);
    const info = transport.requests.find((request) => request.path === "/Items/item-1/PlaybackInfo");
    expect(info?.query?.map(([name]) => name)).toEqual([
      "EnableDirectPlay",
      "EnableDirectStream",
      "EnableTranscoding",
      "AllowVideoStreamCopy",
      "AllowAudioStreamCopy",
      "AutoOpenLiveStream",
      "UserId",
      "StartTimeTicks",
      "MaxStreamingBitrate",
    ]);
    expect(info?.query).toContainEqual(["EnableDirectPlay", "true"]);
    expect(info?.query).toContainEqual(["AutoOpenLiveStream", "false"]);
    expect(info?.query).toContainEqual(["StartTimeTicks", "5"]);
    expect(typeof info?.body).toBe("object");
    expect(info?.body).toMatchObject({ EnableDirectPlay: true, UserId: "user-1", StartTimeTicks: 5 });
  });
});

describe("the gateway's session", () => {
  it("holds an opaque session id: sessionId() throws before sign-in and after sign-out", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    expect(() => gateway.sessionId()).toThrow(/Sign in/);
    await gateway.login("Louise", "hunter2");
    expect(gateway.sessionId()).toBe("session-1");
    expect(gateway.currentUserName()).toBe("Louise");
    await gateway.logout();
    expect(() => gateway.sessionId()).toThrow(/Sign in/);
    expect(gateway.currentUserName()).toBeUndefined();
  });

  it("no longer has authorizationHeader() or trickplayTile()", () => {
    const gateway = new JellyfinGateway("https://media.test", webCrypto, new RecordingTransport(), "install-1");
    expect("authorizationHeader" in gateway).toBe(false);
    expect("trickplayTile" in gateway).toBe(false);
  });

  it("returns the user and uses the typed name or the Quick Connect fallback when the transport gives none", async () => {
    const transport = new RecordingTransport();
    transport.signInResult = { session: "session-2", userId: "user-2" };
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await expect(gateway.login("typed-name", "pw")).resolves.toEqual({ userId: "user-2", username: "typed-name" });
    await expect(gateway.authenticateWithQuickConnect("qc-secret")).resolves.toEqual({ userId: "user-2", username: "Jellyfin user" });
    expect(gateway.sessionId()).toBe("session-2");
  });

  it("holds neither the password, the Quick Connect secret nor anything the sign-in result carries beyond its fields", async () => {
    const canary = "canary-access-token-0001";
    const forgetful: Transport = {
      async signIn(): Promise<SignInResult> {
        return { session: "session-opaque-1", userId: "user-1", userName: "Louise", serverId: "server-1", accessToken: canary } as SignInResult;
      },
      async request(request: TransportRequest): Promise<TransportResponse> {
        return { status: 200, body: answerFor(request) };
      },
      async endSession(): Promise<void> {},
    };
    const gateway = new JellyfinGateway("https://media.test", webCrypto, forgetful, "install-1");
    await gateway.connect();
    await gateway.login("Louise", "hunter2-password");
    await gateway.authenticateWithQuickConnect("qc-secret-value");
    await quiet(gateway.userViews());

    const strings = reachableStrings(gateway);
    expect(strings.some((text) => text.includes(canary))).toBe(false);
    expect(strings.some((text) => text.includes("hunter2-password"))).toBe(false);
    expect(strings.some((text) => text.includes("qc-secret-value"))).toBe(false);
    expect(JSON.stringify(gateway)).not.toContain(canary);
    expect(JSON.stringify(gateway)).not.toContain("hunter2-password");
    // The walk is not vacuous: it sees what the gateway does hold.
    expect(strings.some((text) => text.includes("user-1"))).toBe(true);
  });
});

// Every string reachable from a value through own properties, array items, Map keys and values and Set members.
// A TypeScript `private` field is an ordinary property at run time, so the walk sees it; an ECMAScript #private
// field or a closure it cannot see.
function reachableStrings(root: unknown): string[] {
  const found: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      found.push(value);
      return;
    }
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Map) {
      for (const [key, entry] of value) {
        visit(key);
        visit(entry);
      }
    } else if (value instanceof Set) {
      for (const entry of value) visit(entry);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "string") found.push(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && "value" in descriptor) visit(descriptor.value);
    }
  };
  visit(root);
  return found;
}

describe("the deep walk used above", () => {
  it("finds a string in a TypeScript private field, a Map and a Set, and not in an ECMAScript private field", () => {
    class Tagged {
      private secret = "needle-ts-private";
      readonly map = new Map<string, string>([["k", "needle-in-map"]]);
      readonly set = new Set(["needle-in-set"]);
    }
    class Hidden {
      #secret = "needle-hash-private";
      reveal(): string {
        return this.#secret;
      }
    }
    const strings = reachableStrings({ tagged: new Tagged(), hidden: new Hidden() });
    expect(strings).toContain("needle-ts-private");
    expect(strings).toContain("needle-in-map");
    expect(strings).toContain("needle-in-set");
    expect(strings).not.toContain("needle-hash-private");
  });
});

describe("sign-in answers and statuses", () => {
  it.each([
    ["login", (g: JellyfinGateway) => g.login("Louise", "hunter2")],
    ["authenticateWithQuickConnect", (g: JellyfinGateway) => g.authenticateWithQuickConnect("qc-secret")],
  ] as const)("%s maps an unexpected-response from signIn to the plain session failure", async (_name, run) => {
    const transport = new RecordingTransport();
    transport.signInError = new TransportError("unexpected-response");
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    const error = await run(gateway).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SignInFailure);
    expect((error as SignInFailure).kind).toBe("unexpected-response");
    expect((error as SignInFailure).message).toBe("Jellyfin did not return a valid user session.");
    expect(() => gateway.sessionId()).toThrow(/Sign in/);
  });

  it("raises a resolved 4xx or 5xx status as a TransportError with its status", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await gateway.login("Louise", "hunter2");
    for (const [status, kind] of [[401, "request"], [403, "request"], [500, "server"], [503, "server"]] as const) {
      transport.answers.set("GET /UserViews", { status, body: { Message: "ignored" } });
      const error = await gateway.userViews().then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as { code?: unknown }).code).toBe("status");
      expect((error as { status?: unknown }).status).toBe(status);
      expect(classifyTransportError(error)).toBe(kind);
    }
  });

  it("treats a resolved 404 as an answer where the gateway always did", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await gateway.login("Louise", "hunter2");
    transport.answers.set("GET /Items/item-1/Collections", { status: 404, body: undefined });
    transport.answers.set("GET /Items/item-1", { status: 404, body: undefined });
    await expect(gateway.itemCollections("item-1")).resolves.toBeUndefined();
    await expect(gateway.itemDetail("item-1")).rejects.toBeInstanceOf(ItemNotFoundError);
  });

  it("rejects a cancelled call with an AbortError and a network failure as the network kind", async () => {
    const transport = new RecordingTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await gateway.login("Louise", "hunter2");
    const failWith = (code: "cancelled" | "network" | "timeout") => {
      transport.request = async () => {
        throw new TransportError(code);
      };
    };

    failWith("cancelled");
    const cancelled = await gateway.userViews().then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect((cancelled as Error).name).toBe("AbortError");
    expect(classifyTransportError(cancelled)).toBeUndefined();

    for (const code of ["network", "timeout"] as const) {
      failWith(code);
      const error = await gateway.userViews().then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(classifyTransportError(error), code).toBe("network");
    }
  });
});
