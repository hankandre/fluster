import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEngine, PlayerEvent } from "../domain/playback";
import { JellyfinGateway } from "./jellyfin/gateway";
import type { HttpRequestConfig, HttpTransport } from "./jellyfin/types";
import { PlaybackCoordinator, type PlaybackGateway } from "./player/coordinator";
import { redactError, redactText, redactUrl } from "./redact";

const CANARY = "CANARY-7f3a9c1e5b";
const SERVER = "https://media.test/jellyfin";

// Every credential position the code knows about, as full and relative URLs.
const canaryUrls = [
  `${SERVER}/Videos/1/stream?api_key=${CANARY}`,
  `${SERVER}/Videos/1/stream?ApiKey=${CANARY}&Static=true`,
  `${SERVER}/Videos/1/stream?Static=true&access_token=${CANARY}`,
  `${SERVER}/Videos/1/stream?token=${CANARY}`,
  `${SERVER}/Videos/1/stream?X-Emby-Token=${CANARY}`,
  `https://user:${CANARY}@media.test/Videos/1/stream`,
  `https://${CANARY}@media.test/Videos/1/stream`,
  `/Videos/1/stream?api_key=${CANARY}`,
  `/Videos/1/stream?X-Emby-Token=${CANARY}&Static=true`,
];

// Texts a transport, axios, or the browser might put around a URL or header.
function errorTexts(): string[] {
  const texts = canaryUrls.flatMap((url) => [
    url,
    `Network Error requesting ${url}`,
    `Request failed for "${url}" with status code 500`,
    `timeout of 10000ms exceeded (${url})`,
  ]);
  texts.push(
    `Authorization: MediaBrowser Client="Fluster", Token="${CANARY}"`,
    `Authorization: MediaBrowser Client="Fluster", Token=${CANARY}`,
    `Authorization: Bearer ${CANARY}`,
    `X-Emby-Token: ${CANARY}`,
    `X-MediaBrowser-Token: ${CANARY}`,
    `Authorization: Custom scheme="x" ${CANARY}`,
    `token = ${CANARY}`,
    `token: "${CANARY}"`,
    `{"AccessToken":"${CANARY}","User":{}}`,
    `{"Pw":"${CANARY}"}`,
    `{"Password":"${CANARY}"}`,
    `auth_token=${CANARY}`,
    `sessionToken=${CANARY}`,
    `password=${CANARY}`,
    `/Videos/1/stream?PlaySessionId=${CANARY}`,
    `header x-emby-token=${CANARY}`,
  );
  return texts;
}

const logMethods = ["log", "info", "warn", "error", "debug"] as const;
let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  consoleSpies = logMethods.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectNoCanaryInConsole(): void {
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CANARY);
  }
}

function expectClean(label: string, text: string): void {
  expect(text, `canary leaked through ${label}`).not.toContain(CANARY);
}

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };
const snapshot: PlaybackSnapshot = {
  positionSeconds: 1,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software", droppedFrames: 0 },
};

describe("redaction canary: redact helpers", () => {
  it("never lets the canary through redactUrl or redactText", () => {
    for (const text of errorTexts()) {
      expectClean(`redactText(${text})`, redactText(text));
    }
    for (const url of canaryUrls.filter((candidate) => candidate.startsWith("http"))) {
      expectClean(`redactUrl(${url})`, redactUrl(url));
    }
    expectClean("redactUrl fallback", redactUrl(`not a url?api_key=${CANARY}`));
  });
});

class FailingTransport implements HttpTransport {
  constructor(private readonly text: string) {}

  private fail(): never {
    const error = new Error(this.text);
    // Axios errors also carry the request config; the canary must not be surfaced from it either.
    Object.assign(error, { config: { url: canaryUrls[0] } });
    throw error;
  }

  async get<T>(_url: string, _config?: HttpRequestConfig): Promise<{ data: T }> {
    return this.fail();
  }

  async post<T>(url: string, _data?: unknown, _config?: HttpRequestConfig): Promise<{ data: T }> {
    if (url === "/Users/AuthenticateByName") {
      return { data: { AccessToken: CANARY, User: { Id: "user-1", Name: "Louise" } } as T };
    }
    return this.fail();
  }
}

async function messageOf(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("redaction canary: JellyfinGateway", () => {
  it("never surfaces the canary in thrown errors or console output", async () => {
    for (const text of errorTexts()) {
      const gateway = new JellyfinGateway(SERVER, new FailingTransport(text));
      await gateway.login("Louise", "password");
      const messages = [
        await messageOf(() => gateway.connect()),
        await messageOf(() => gateway.latest()),
        await messageOf(() => gateway.createPlaybackPlan(item)),
        await messageOf(() => gateway.reportStart({ ...planWith("x") }, snapshot)),
        await messageOf(() => gateway.reportProgress({ ...planWith("x") }, snapshot)),
        await messageOf(() => gateway.reportStopped({ ...planWith("x") }, snapshot)),
      ];
      for (const message of messages) {
        expect(message).not.toBe("");
        expectClean(`gateway error for "${text}"`, message);
      }
    }
    expectNoCanaryInConsole();
  }, 60_000);

  it("keeps the access token out of errors for rejected playback info", async () => {
    const transport = new FailingTransport("unused");
    transport.post = async <T>(url: string): Promise<{ data: T }> => {
      if (url === "/Users/AuthenticateByName") {
        return { data: { AccessToken: CANARY, User: { Id: "user-1" } } as T };
      }
      return {
        data: {
          PlaySessionId: "session",
          MediaSources: [{ Id: "s", Path: "/x", SupportsDirectPlay: true, TranscodingUrl: `/t?api_key=${CANARY}` }],
        } as T,
      };
    };
    const gateway = new JellyfinGateway(SERVER, transport);
    await gateway.login("Louise", "password");
    expectClean("selectDirectFileSource error", await messageOf(() => gateway.createPlaybackPlan(item)));

    transport.post = async <T>(url: string): Promise<{ data: T }> => {
      if (url === "/Users/AuthenticateByName") {
        return { data: { AccessToken: CANARY, User: { Id: "user-1" } } as T };
      }
      return {
        data: {
          PlaySessionId: "session",
          MediaSources: [{
            Id: "s",
            Path: "/x",
            SupportsDirectPlay: true,
            MediaStreams: [{ Index: 2, Type: "Subtitle", IsExternal: true, DeliveryUrl: `/sub?api_key=${CANARY}` }],
          }],
        } as T,
      };
    };
    expectClean("unsafe subtitle error", await messageOf(() => gateway.createPlaybackPlan(item)));
    expectNoCanaryInConsole();
  }, 60_000);

  it("rejects server URLs carrying credentials without echoing them", () => {
    for (const url of [`https://user:${CANARY}@media.test`, `https://${CANARY}@media.test`]) {
      let message = "";
      try {
        new JellyfinGateway(url, new FailingTransport("x"));
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe("");
      expectClean("server URL error", message);
    }
  });
});

function planWith(playSessionId: string): PlaybackPlan {
  return {
    itemId: "one",
    title: "One",
    streamUrl: `${SERVER}/Videos/1/stream?api_key=${CANARY}`,
    mediaSourceId: "source",
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
  };
}

class FakePlayer implements PlayerEngine {
  mode = "native" as const;
  listener?: (event: PlayerEvent) => void;
  initialize = vi.fn(async () => ({
    mode: "native" as const,
    embedded: true,
    renderer: "test",
    nativeRenderer: "test",
  }));
  subscribe = vi.fn(async (listener: (event: PlayerEvent) => void) => { this.listener = listener; return () => undefined; });
  setSurface = vi.fn(async () => undefined);
  launch = vi.fn<(plan: PlaybackPlan) => Promise<void>>(async () => undefined);
  setPaused = vi.fn(async () => undefined);
  seek = vi.fn(async () => undefined);
  setVolume = vi.fn(async () => undefined);
  setMuted = vi.fn(async () => undefined);
  selectTrack = vi.fn(async () => undefined);
  setFullscreen = vi.fn(async () => undefined);
  stop = vi.fn<() => Promise<void>>(async () => undefined);
}

describe("redaction canary: redactError", () => {
  it("redacts DOMException and frozen errors without throwing, keeping the name", () => {
    const abort = new DOMException(`aborted ${canaryUrls[0]}`, "AbortError");
    const redactedAbort = redactError(abort) as Error;
    expectClean("DOMException", redactedAbort.message);
    expect(redactedAbort.name).toBe("AbortError");

    const frozen = Object.freeze(new Error(`failed ${canaryUrls[7]}`));
    const redactedFrozen = redactError(frozen) as Error;
    expectClean("frozen error", redactedFrozen.message);
  });

  it("redacts ordinary errors in place and ignores non-errors", () => {
    const error = new Error(canaryUrls[0]);
    expect(redactError(error)).toBe(error);
    expectClean("in-place", error.message);
    expect(redactError("plain")).toBe("plain");
  });
});

describe("redaction canary: PlaybackCoordinator", () => {
  it("redacts player error events before they reach the UI", async () => {
    for (const text of errorTexts()) {
      const gateway = {
        createPlaybackPlan: vi.fn(async () => planWith("session")),
        reportStart: vi.fn(async () => undefined),
        reportProgress: vi.fn(async () => undefined),
        reportStopped: vi.fn(async () => undefined),
      } as PlaybackGateway;
      const player = new FakePlayer();
      const surfaced: string[] = [];
      const coordinator = new PlaybackCoordinator(gateway, player, {
        onEvent: (event) => { if (event.kind === "error") surfaced.push(event.message); },
        onReportingError: vi.fn(),
      });
      await coordinator.start(item);
      player.listener?.({ kind: "error", message: text });
      await vi.waitFor(() => expect(surfaced).toHaveLength(1));
      expectClean(`player error event "${text}"`, surfaced[0]);
      await coordinator.stop().catch(() => undefined);
    }
    expectNoCanaryInConsole();
  }, 60_000);

  it("surfaces no canary from reporting warnings, shutdown failures, or console", async () => {
    for (const text of errorTexts()) {
      const reportError = new Error(text);
      const gateway = {
        createPlaybackPlan: vi.fn(async () => planWith("session")),
        reportStart: vi.fn(async () => { throw reportError; }),
        reportProgress: vi.fn(async () => { throw reportError; }),
        reportStopped: vi.fn(async () => { throw reportError; }),
      } as PlaybackGateway;
      const player = new FakePlayer();
      player.stop.mockRejectedValue(new Error(text));
      const surfaced: string[] = [];
      const coordinator = new PlaybackCoordinator(gateway, player, {
        onEvent: (event) => { if (event.kind === "error") surfaced.push(event.message); },
        onReportingError: (warning) => surfaced.push(warning),
      });
      await coordinator.start(item);
      player.listener?.({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      player.listener?.({ kind: "state", snapshot: { ...snapshot, paused: true }, cause: "pause" });
      await vi.waitFor(() => expect(gateway.reportProgress).toHaveBeenCalled());
      player.listener?.({ kind: "ended", snapshot, reason: "eof" });
      await vi.waitFor(() => expect(surfaced.length).toBeGreaterThan(0));
      for (const message of surfaced) expectClean(`coordinator surface for "${text}"`, message);
      await coordinator.stop().catch(() => undefined);
    }
    expectNoCanaryInConsole();
  }, 60_000);

  it("surfaces no canary when plan creation or launch fails", async () => {
    for (const text of errorTexts()) {
      const gateway = {
        createPlaybackPlan: vi.fn(async () => planWith("session")),
        reportStart: vi.fn(async () => undefined),
        reportProgress: vi.fn(async () => undefined),
        reportStopped: vi.fn(async () => undefined),
      } as PlaybackGateway;
      const player = new FakePlayer();
      player.launch.mockRejectedValue(new Error(text));
      const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
      expectClean(`launch failure for "${text}"`, await messageOf(() => coordinator.start(item)));

      gateway.createPlaybackPlan = vi.fn(async () => { throw new Error(text); });
      const failing = new PlaybackCoordinator(gateway, new FakePlayer(), { onEvent: vi.fn(), onReportingError: vi.fn() });
      expectClean(`plan failure for "${text}"`, await messageOf(() => failing.start(item)));
    }
    expectNoCanaryInConsole();
  }, 60_000);
});
