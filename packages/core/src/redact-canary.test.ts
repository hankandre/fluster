import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "./domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEvent } from "./domain/playback";
import { JellyfinGateway } from "./jellyfin/gateway";
import type { SignInRequest, SignInResult, Transport, TransportRequest, TransportResponse } from "./ports/transport";
import { PlaybackCoordinator, type PlaybackGateway } from "./player/coordinator";
import { diagnosticsText } from "./diagnostics";
import { redactError, redactText, redactUrl } from "./redact";
import { safeReason } from "./safe-reason";
import { webCrypto } from "./adapters/web-crypto";
import { FakeClock } from "./ports/fake-clock";
import { createFakePlayerEngine } from "./player/fake-player-engine";

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

// Texts a transport or the browser might put around a URL or header.
function errorTexts(): string[] {
  const texts = canaryUrls.flatMap((url) => [
    url,
    `Network Error requesting ${url}`,
    `Request failed for "${url}" with status code 500`,
    `timeout of 10000ms exceeded (${url})`,
  ]);
  texts.push(
    `Authorization: MediaBrowser Client="Octave", Token="${CANARY}"`,
    `Authorization: MediaBrowser Client="Octave", Token=${CANARY}`,
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
    `PlaySessionId ${CANARY}`,
    `X-Emby-Token ${CANARY}`,
    `Authorization MediaBrowser Token ${CANARY}`,
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

describe("redaction canary: safeReason", () => {
  it("hides a canary carried inside each address or path form", () => {
    const texts = [
      `connect to ${CANARY}.test:8096 failed`,
      `cannot open /${CANARY}`,
      `cannot open C:/Users/${CANARY}/x.dll`,
      `cannot open \\\\${CANARY}\\share\\x.mkv`,
      `GET http://[::1]:8096/${CANARY}/index.html failed`,
    ];
    for (const text of texts) {
      expectClean(`safeReason(${text})`, safeReason(text));
    }
  });
});

// A transport that breaks the port's rules: it fails with the canary in the message and attaches the request config.
// The gateway must still keep the canary out of what it throws.
class FailingTransport implements Transport {
  constructor(private readonly text: string) {}

  private fail(): never {
    const error = new Error(this.text);
    // An adapter may attach the request config; the canary must not be surfaced from it either.
    Object.assign(error, { config: { url: canaryUrls[0] } });
    throw error;
  }

  async signIn(_request: SignInRequest): Promise<SignInResult> {
    return { session: "session-1", userId: "user-1", userName: "Louise" };
  }

  async request(_request: TransportRequest): Promise<TransportResponse> {
    return this.fail();
  }

  async endSession(): Promise<void> {
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
      const gateway = new JellyfinGateway(SERVER, webCrypto, new FailingTransport(text));
      await gateway.login("Louise", "password");
      const messages = [
        await messageOf(() => gateway.connect()),
        await messageOf(() => gateway.resumeItems()),
        await messageOf(() => gateway.createPlaybackPlan(item)),
        await messageOf(() => gateway.reportStart({ ...planWith("x") }, snapshot)),
        await messageOf(() => gateway.reportProgress({ ...planWith("x") }, snapshot)),
        await messageOf(() => gateway.reportStopped({ ...planWith("x") }, snapshot)),
        await messageOf(() => gateway.stopActiveEncoding("play-session")),
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
    transport.request = async (): Promise<TransportResponse> => ({
      status: 200,
      body: {
        PlaySessionId: "session",
        MediaSources: [{ Id: "s", Path: "/x", Protocol: "File", SupportsDirectPlay: true, TranscodingUrl: `/t?api_key=${CANARY}` }],
      },
    });
    const gateway = new JellyfinGateway(SERVER, webCrypto, transport);
    await gateway.login("Louise", "password");
    expectClean("source refusal error", await messageOf(() => gateway.createPlaybackPlan(item)));

    transport.request = async (): Promise<TransportResponse> => ({
      status: 200,
      body: {
        PlaySessionId: "session",
        MediaSources: [{
          Id: "s",
          Path: "/x",
          Protocol: "File",
          SupportsDirectPlay: true,
          MediaStreams: [{ Index: 2, Type: "Subtitle", IsExternal: true, DeliveryUrl: `https://attacker.test/sub?ApiKey=${CANARY}` }],
        }],
      },
    });
    expectClean("unsafe subtitle error", await messageOf(() => gateway.createPlaybackPlan(item)));
    expectNoCanaryInConsole();
  }, 60_000);

  it("rejects server URLs carrying credentials without echoing them", () => {
    for (const url of [`https://user:${CANARY}@media.test`, `https://${CANARY}@media.test`]) {
      let message = "";
      try {
        new JellyfinGateway(url, webCrypto, new FailingTransport("x"));
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
    streamUrl: `${SERVER}/Videos/1/stream?Static=true`,
    mediaSourceId: "source",
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
  };
}

// The shared port-only fake, with spies on the members these tests script or count.
function fakePlayer() {
  const fake = createFakePlayerEngine();
  return {
    ...fake,
    subscribe: vi.spyOn(fake.engine, "subscribe"),
    launch: vi.spyOn(fake.engine, "launch"),
    stop: vi.spyOn(fake.engine, "stop"),
  };
}

function canaryGateway(plan: PlaybackPlan): PlaybackGateway {
  return {
    createPlaybackPlan: vi.fn(async () => plan),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    sessionId: () => "session-1",
    stopActiveEncoding: vi.fn(async () => undefined),
  } as PlaybackGateway;
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

  it("redacts a string", () => {
    for (const text of errorTexts()) {
      const redacted = redactError(text);
      expect(typeof redacted).toBe("string");
      expectClean("string", redacted as string);
    }
  });
});

describe("redaction canary: PlaybackCoordinator", () => {
  it("keeps only a known code of a player error event before it reaches the UI", async () => {
    for (const text of errorTexts()) {
      const gateway = {
        createPlaybackPlan: vi.fn(async () => planWith("session")),
        reportStart: vi.fn(async () => undefined),
        reportProgress: vi.fn(async () => undefined),
        reportStopped: vi.fn(async () => undefined),
        sessionId: () => "session-1",
        stopActiveEncoding: vi.fn(async () => undefined),
      } as PlaybackGateway;
      const player = fakePlayer();
      const surfaced: PlayerEvent[] = [];
      const coordinator = new PlaybackCoordinator(gateway, player.engine, {
        onEvent: (event) => { if (event.kind === "error") surfaced.push(event); },
        onReportingError: vi.fn(),
      }, new FakeClock());
      await coordinator.start(item);
      // The canary as free text beside a valid code, and as the code itself (casts: the port allows neither).
      player.emit({ kind: "error", code: "network", message: text } as unknown as PlayerEvent);
      player.emit({ kind: "error", code: text } as unknown as PlayerEvent);
      await vi.waitFor(() => expect(surfaced).toHaveLength(2));
      expect(surfaced).toEqual([{ kind: "error", code: "network" }, { kind: "error", code: "unknown" }]);
      expectClean(`player error event "${text}"`, JSON.stringify(surfaced));
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
        sessionId: () => "session-1",
        stopActiveEncoding: vi.fn(async () => undefined),
      } as PlaybackGateway;
      const player = fakePlayer();
      player.stop.mockRejectedValue(new Error(text));
      const surfaced: string[] = [];
      const coordinator = new PlaybackCoordinator(gateway, player.engine, {
        onEvent: (event) => { if (event.kind === "error") surfaced.push(JSON.stringify(event)); },
        onReportingError: (warning) => surfaced.push(warning),
      }, new FakeClock());
      await coordinator.start(item);
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      player.emit({ kind: "state", snapshot: { ...snapshot, paused: true }, cause: "pause" });
      await vi.waitFor(() => expect(gateway.reportProgress).toHaveBeenCalled());
      player.emit({ kind: "ended", snapshot, reason: "eof" });
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
        sessionId: () => "session-1",
        stopActiveEncoding: vi.fn(async () => undefined),
      } as PlaybackGateway;
      const player = fakePlayer();
      player.launch.mockRejectedValue(new Error(text));
      const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
      expectClean(`launch failure for "${text}"`, await messageOf(() => coordinator.start(item)));
      const stringPlayer = fakePlayer();
      stringPlayer.launch.mockRejectedValue(text);
      const stringLaunch = new PlaybackCoordinator(gateway, stringPlayer.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
      const fromString = await stringLaunch.start(item).catch((error: unknown) => error);
      expect(stringPlayer.launch).toHaveBeenCalledTimes(1);
      expectClean(`launch failure string for "${text}"`, `${String(fromString)} ${JSON.stringify(fromString)}`);

      gateway.createPlaybackPlan = vi.fn(async () => { throw new Error(text); });
      const failing = new PlaybackCoordinator(gateway, fakePlayer().engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
      expectClean(`plan failure for "${text}"`, await messageOf(() => failing.start(item)));
    }
    expectNoCanaryInConsole();
  }, 60_000);
});

describe("redaction canary: the launch request", () => {
  it("refuses a plan whose stream URL carries a credential or is not absolute, and launches nothing", async () => {
    for (const url of canaryUrls) {
      const player = fakePlayer();
      const coordinator = new PlaybackCoordinator(canaryGateway({ ...planWith("session"), streamUrl: url }), player.engine, {
        onEvent: vi.fn(),
        onReportingError: vi.fn(),
      }, new FakeClock());
      const error = await coordinator.start(item).catch((caught: unknown) => caught);
      expect(error, `start with ${url}`).toBeInstanceOf(Error);
      expectClean(`launch refusal for "${url}"`, `${String(error)} ${JSON.stringify(error)} ${JSON.stringify(Object.entries(error as object))}`);
      expect(player.subscribe).not.toHaveBeenCalled();
      expect(player.launch).not.toHaveBeenCalled();
    }
    expectNoCanaryInConsole();
  }, 60_000);
});

describe("redaction canary: diagnostics", () => {
  it("never lets the canary into the copied report, whatever free text a field holds", () => {
    for (const text of [...errorTexts(), ...canaryUrls]) {
      const report = diagnosticsText({
        appVersion: text,
        os: text,
        player: { kind: "native", libmpvVersion: text, renderer: text },
        decode: { mode: "hardware", hwdec: text },
        serverVersion: text,
        hostClass: "public",
      });
      expectClean(`diagnosticsText(${text})`, report);
      expect(report.split("\n")).toHaveLength(7);
    }
    expectNoCanaryInConsole();
  });
});
