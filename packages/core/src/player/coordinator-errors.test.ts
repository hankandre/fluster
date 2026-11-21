// T2-05 acceptance item 6: errors from an engine are typed codes, never free text from the player. No player text
// reaches the coordinator's callers, a thrown error or the session state.
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEvent } from "../domain/playback";
import { PLAYER_ERROR_CODES, PLAYER_ERROR_MESSAGES, PlayerEngineError } from "../domain/player-engine";
import { FakeClock } from "../ports/fake-clock";
import { PlaybackCoordinator, type PlaybackGateway } from "./coordinator";
import { createFakePlayerEngine } from "./fake-player-engine";
import { initialPlaybackSessionState, playbackSessionReducer } from "./session-state";

const NATIVE_TEXT = "mpv could not open https://media.test/x?api_key=SECRET-TOKEN /home/u/x.mkv";
const LEAKS = ["mpv", "SECRET-TOKEN", "media.test", "/home/u"];

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };
const plan: PlaybackPlan = {
  itemId: "one",
  title: "One",
  streamUrl: "https://server.test/Videos/one/stream?Static=true",
  mediaSourceId: "source",
  playSessionId: "play-1",
  startPositionTicks: 0,
  tracks: [],
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};
const snapshot: PlaybackSnapshot = {
  positionSeconds: 7,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software", droppedFrames: 0 },
};
const signal = expect.any(AbortSignal);

function setup() {
  const gateway = {
    createPlaybackPlan: vi.fn(async () => plan),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    sessionId: () => "session-1",
    stopActiveEncoding: vi.fn(async () => undefined),
  } satisfies PlaybackGateway;
  const fake = createFakePlayerEngine();
  const subscribe = vi.spyOn(fake.engine, "subscribe");
  const launch = vi.spyOn(fake.engine, "launch");
  const stop = vi.spyOn(fake.engine, "stop");
  const onEvent = vi.fn<(event: PlayerEvent) => void>();
  const coordinator = new PlaybackCoordinator(gateway, fake.engine, { onEvent, onReportingError: vi.fn() }, new FakeClock());
  const errorEvents = () => onEvent.mock.calls.map(([event]) => event).filter((event) => event.kind === "error");
  return { gateway, fake, subscribe, launch, stop, onEvent, errorEvents, coordinator };
}

function expectNoPlayerText(error: unknown): void {
  const text = `${String(error)} ${JSON.stringify(error)} ${JSON.stringify(Object.entries(error as object))} ${String((error as Error).cause)}`;
  for (const leak of LEAKS) expect(text).not.toContain(leak);
}

describe("player error copy", () => {
  it("has one fixed sentence per code, keeping the coordinator's existing copy", () => {
    expect(Object.keys(PLAYER_ERROR_MESSAGES).sort()).toEqual([...PLAYER_ERROR_CODES].sort());
    for (const code of PLAYER_ERROR_CODES) expect(PLAYER_ERROR_MESSAGES[code].trim().length).toBeGreaterThan(0);
    expect(PLAYER_ERROR_MESSAGES.unknown).toBe("Something went wrong.");
    expect(PLAYER_ERROR_MESSAGES["stop-failed"]).toBe("The player did not finish shutting down.");
  });

  it("builds a PlayerEngineError that carries its code and the fixed copy", () => {
    const error = new PlayerEngineError("session-ended");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("session-ended");
    expect(error.message).toBe(PLAYER_ERROR_MESSAGES["session-ended"]);
  });
});

describe("error events", () => {
  it("passes a known code through as exactly that event", async () => {
    const { fake, onEvent, coordinator } = setup();
    await coordinator.start(item);
    fake.emit({ kind: "error", code: "decoder-unavailable" });
    await coordinator.flush();
    expect(onEvent).toHaveBeenCalledWith({ kind: "error", code: "decoder-unavailable" });
  });

  it.each([
    ["an unknown code", { kind: "error", code: "bogus" }],
    ["an undefined code", { kind: "error", code: undefined }],
    ["a missing code", { kind: "error" }],
  ])("turns %s into unknown", async (_name, event) => {
    const { fake, errorEvents, coordinator } = setup();
    await coordinator.start(item);
    fake.emit(event as unknown as PlayerEvent);
    await coordinator.flush();
    expect(errorEvents()).toEqual([{ kind: "error", code: "unknown" }]);
  });

  it("drops every field but the code", async () => {
    const { fake, errorEvents, coordinator } = setup();
    await coordinator.start(item);
    fake.emit({ kind: "error", code: "network", message: NATIVE_TEXT } as unknown as PlayerEvent);
    await coordinator.flush();
    expect(errorEvents()).toEqual([{ kind: "error", code: "network" }]);
    expect(Object.keys(errorEvents()[0]).sort()).toEqual(["code", "kind"]);
  });
});

describe("launch rejections", () => {
  it.each([
    ["a string", NATIVE_TEXT],
    ["an Error", new Error(NATIVE_TEXT)],
  ])("turn %s into the unknown code with no player text, and still report a failed stop", async (_name, failure) => {
    const { gateway, fake, launch, coordinator } = setup();
    launch.mockImplementation(async () => {
      fake.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      throw failure;
    });
    const error = await coordinator.start(item).catch((caught: unknown) => caught);
    await coordinator.flush();
    expect(error).toBeInstanceOf(PlayerEngineError);
    expect((error as PlayerEngineError).code).toBe("unknown");
    expect((error as PlayerEngineError).message).toBe(PLAYER_ERROR_MESSAGES.unknown);
    expectNoPlayerText(error);
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, signal, true);
  });

  it("keep the code of a typed engine error", async () => {
    const { launch, coordinator } = setup();
    launch.mockRejectedValue(new PlayerEngineError("session-ended"));
    const error = await coordinator.start(item).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlayerEngineError);
    expect((error as PlayerEngineError).code).toBe("session-ended");
    expect((error as PlayerEngineError).message).toBe(PLAYER_ERROR_MESSAGES["session-ended"]);
  });

  it("rebuild a typed engine error whose message and cause carry player text", async () => {
    const { launch, coordinator } = setup();
    const altered = new PlayerEngineError("network");
    altered.message = NATIVE_TEXT;
    Object.defineProperty(altered, "cause", { value: NATIVE_TEXT, enumerable: true });
    launch.mockRejectedValue(altered);
    const error = await coordinator.start(item).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlayerEngineError);
    expect((error as PlayerEngineError).code).toBe("network");
    expect((error as PlayerEngineError).message).toBe(PLAYER_ERROR_MESSAGES.network);
    expectNoPlayerText(error);
  });

  it("rebuild a typed engine error with a code outside the list as unknown", async () => {
    const { launch, coordinator } = setup();
    const forged = Object.create(PlayerEngineError.prototype) as PlayerEngineError;
    Object.defineProperties(forged, {
      code: { value: "bogus", enumerable: true },
      message: { value: NATIVE_TEXT, enumerable: true },
      cause: { value: NATIVE_TEXT, enumerable: true },
    });
    launch.mockRejectedValue(forged);
    const error = await coordinator.start(item).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlayerEngineError);
    expect((error as PlayerEngineError).code).toBe("unknown");
    expect((error as PlayerEngineError).message).toBe(PLAYER_ERROR_MESSAGES.unknown);
    expectNoPlayerText(error);
  });
});

describe("subscribe rejections", () => {
  it.each([
    ["a string", NATIVE_TEXT],
    ["an Error", new Error(NATIVE_TEXT)],
  ])("turn %s into the unknown code with no player text, and launch nothing", async (_name, failure) => {
    const { subscribe, launch, coordinator } = setup();
    subscribe.mockRejectedValue(failure);
    const error = await coordinator.start(item).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlayerEngineError);
    expect((error as PlayerEngineError).code).toBe("unknown");
    expectNoPlayerText(error);
    expect(launch).not.toHaveBeenCalled();
  });
});

describe("a failed stop after the end", () => {
  it("is the stop-failed code, with no player text", async () => {
    const { gateway, fake, stop, errorEvents, coordinator } = setup();
    stop.mockRejectedValueOnce(new Error(NATIVE_TEXT));
    await coordinator.start(item);
    fake.emit({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
    fake.emit({ kind: "ended", snapshot, reason: "eof" });
    await coordinator.flush();
    expect(errorEvents()).toEqual([{ kind: "error", code: "stop-failed" }]);
  });
});

describe("the session state", () => {
  it("shows the fixed copy for an error event's code and keeps the code", () => {
    const state = playbackSessionReducer(initialPlaybackSessionState, { type: "event", event: { kind: "error", code: "decoder-unavailable" } });
    expect(state.error).toBe(PLAYER_ERROR_MESSAGES["decoder-unavailable"]);
    expect(state.errorCode).toBe("decoder-unavailable");
  });

  it("clears the code on a later failure and on reset", () => {
    const failed = playbackSessionReducer(initialPlaybackSessionState, { type: "event", event: { kind: "error", code: "network" } });
    const afterFailure = playbackSessionReducer(failed, { type: "failure", message: "Jellyfin request failed.", kind: "network" });
    expect(afterFailure.errorCode).toBeUndefined();
    expect(afterFailure.error).toBe("Jellyfin request failed.");
    expect(playbackSessionReducer(failed, { type: "reset" }).errorCode).toBeUndefined();
  });
});
