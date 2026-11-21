// @vitest-environment node
// T2-04 acceptance item 3, gateway side: a 3xx answer and a status of 0 are errors on every call, sign-out and
// playstate reports included, and the error tells the viewer to enter the final address. A transport that
// honours the port rejects with TransportError("redirect"); a transport that breaks the contract and resolves
// 302 or 0 is refused as well. The table is keyed by gateway method name; scripts/core-transport-deps.test.ts
// checks that every public gateway method has a row.
//
// login, authenticateWithQuickConnect and sign-out go through signIn and endSession, which resolve with no
// status, so those rows use case (a) only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInFailure } from "../domain/sign-in-failure";
import { TransportError, type SignInRequest, type SignInResult, type Transport, type TransportRequest, type TransportResponse } from "../ports/transport";
import { webCrypto } from "../adapters/web-crypto";
import { JellyfinGateway, REDIRECT_REFUSED_MESSAGE } from "./gateway";

type Mode = "ok" | "reject-redirect" | "status-302" | "status-0";

class FakeTransport implements Transport {
  mode: Mode = "ok";
  signInFails = false;
  endSessionFails = false;
  readonly requests: TransportRequest[] = [];
  readonly ended: string[] = [];
  onEndSession?: () => void;

  async signIn(_request: SignInRequest): Promise<SignInResult> {
    if (this.signInFails) throw new TransportError("redirect");
    return { session: "session-1", userId: "user-1", userName: "Louise", serverId: "server-1" };
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    this.requests.push(request);
    switch (this.mode) {
      case "reject-redirect":
        throw new TransportError("redirect");
      case "status-302":
        return { status: 302, body: undefined };
      case "status-0":
        return { status: 0, body: undefined };
      default:
        return { status: 200, body: answerFor(request) };
    }
  }

  async endSession(session: string): Promise<void> {
    this.ended.push(session);
    this.onEndSession?.();
    if (this.endSessionFails) throw new TransportError("redirect");
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
      return { Authenticated: false };
    case "GET /Users/Me":
      return { Id: "user-1", Configuration: {} };
    case "GET /Localization/Cultures":
    case "GET /Items/Latest":
    case "GET /Sessions":
      return [];
    default:
      return { Items: [] };
  }
}

const PLAN = { itemId: "item-1", mediaSourceId: "source-1", playSessionId: "play-1", playMethod: "DirectPlay" } as never;
const SNAPSHOT = { positionSeconds: 1, paused: false, buffering: false, volume: 50, muted: false, tracks: [], diagnostics: {} } as never;
const ITEM = { id: "item-1", name: "Item", type: "Movie", resumePositionTicks: 0, played: false } as never;
const BROWSE = { itemTypes: ["Movie"], startIndex: 0, limit: 24, sortBy: "SortName", sortOrder: "Ascending", filters: [] } as never;

type Call = (gateway: JellyfinGateway) => Promise<unknown>;

// Rows that reach the server through request().
const requestCalls: Record<string, Call> = {
  "connect": (g) => g.connect(),
  "quickConnectEnabled": (g) => g.quickConnectEnabled(),
  "initiateQuickConnect": (g) => g.initiateQuickConnect(),
  "pollQuickConnect": (g) => g.pollQuickConnect("qc-secret"),
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
  "setPlayed": (g) => g.setPlayed("item-1", true),
  "setFavorite": (g) => g.setFavorite("item-1", false),
  "mediaSegments": (g) => g.mediaSegments("item-1"),
  "createPlaybackPlan": (g) => g.createPlaybackPlan(ITEM),
  "reportStart": (g) => g.reportStart(PLAN, SNAPSHOT),
  "reportProgress": (g) => g.reportProgress(PLAN, SNAPSHOT),
  "reportStopped": (g) => g.reportStopped(PLAN, SNAPSHOT),
  "stopActiveEncoding": (g) => g.stopActiveEncoding("play-1"),
  "sessionPlayMethod": (g) => g.sessionPlayMethod(PLAN),
};

// Rows that reach the server through signIn() or endSession(): case (a) only.
const signInCalls: Record<string, Call> = {
  "login": (g) => g.login("Louise", "hunter2"),
  "authenticateWithQuickConnect": (g) => g.authenticateWithQuickConnect("qc-secret"),
};
const signOutCalls: Record<string, Call> = {
  "logout": (g) => g.logout(),
};

async function signedIn(): Promise<{ gateway: JellyfinGateway; transport: FakeTransport }> {
  const transport = new FakeTransport();
  const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
  await gateway.connect();
  await gateway.login("Louise", "hunter2");
  return { gateway, transport };
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

function expectRedirectFailure(error: unknown): void {
  expect(error).toBeInstanceOf(SignInFailure);
  expect((error as SignInFailure).kind).toBe("redirect");
  expect((error as SignInFailure).message).toBe(REDIRECT_REFUSED_MESSAGE);
  expect((error as SignInFailure).message).toContain("final address");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a redirect or status 0 on every request call", () => {
  const cases = Object.keys(requestCalls).flatMap((name) => (["reject-redirect", "status-302", "status-0"] as const).map((mode) => [name, mode] as const));

  it.each(cases)("%s refuses it when the transport answers %s", async (name, mode) => {
    const { gateway, transport } = await signedIn();
    const before = transport.requests.length;
    transport.mode = mode;
    const error = await failureOf(requestCalls[name](gateway));
    expectRedirectFailure(error);
    expect(transport.requests.length).toBeGreaterThan(before);
  });

  it("answers a status of 200 normally (positive control)", async () => {
    const { gateway, transport } = await signedIn();
    transport.mode = "ok";
    await expect(gateway.userViews()).resolves.toEqual([]);
    await expect(gateway.reportProgress(PLAN, SNAPSHOT)).resolves.toBeUndefined();
  });

  it("refuses a 3xx status other than 302 and every status from 300 to 399", async () => {
    const { gateway, transport } = await signedIn();
    for (const status of [300, 301, 303, 307, 308, 399]) {
      transport.request = async () => ({ status, body: undefined });
      expectRedirectFailure(await failureOf(gateway.userViews()));
    }
  });
});

describe("a redirect on the sign-in calls", () => {
  it.each(Object.keys(signInCalls))("%s refuses a TransportError redirect from signIn", async (name) => {
    const transport = new FakeTransport();
    const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
    await gateway.connect();
    transport.signInFails = true;
    expectRedirectFailure(await failureOf(signInCalls[name](gateway)));
    expect(() => gateway.sessionId()).toThrow(/Sign in/);
  });
});

describe("a redirect on sign-out", () => {
  it.each(Object.keys(signOutCalls))("%s resolves, has cleared the session before the request, and warns with the message", async (name) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { gateway, transport } = await signedIn();
    transport.endSessionFails = true;
    let sessionDuringRequest: string | undefined;
    transport.onEndSession = () => {
      try {
        sessionDuringRequest = gateway.sessionId();
      } catch {
        sessionDuringRequest = undefined;
      }
    };
    await expect(signOutCalls[name](gateway)).resolves.toBeUndefined();
    expect(transport.ended).toEqual(["session-1"]);
    expect(sessionDuringRequest).toBeUndefined();
    expect(() => gateway.sessionId()).toThrow(/Sign in/);
    expect(gateway.currentUserName()).toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Server logout failed; the local session was cleared.", REDIRECT_REFUSED_MESSAGE);
  });

  it("does not warn when the server logout succeeds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { gateway, transport } = await signedIn();
    await gateway.logout();
    expect(transport.ended).toEqual(["session-1"]);
    expect(warn).not.toHaveBeenCalled();
  });
});
