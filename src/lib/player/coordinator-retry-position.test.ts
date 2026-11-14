import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEngine, PlayerEvent } from "../../domain/playback";
import { PlaybackCoordinator, type PlaybackGateway } from "./coordinator";

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 120_000_000, played: false };
const item2: LibraryItem = { id: "two", name: "Two", type: "Movie", resumePositionTicks: 0, played: false };
const resume = { kind: "resume", startPositionTicks: 120_000_000 } as const;

function planFor(playSessionId: string): PlaybackPlan {
  return {
    itemId: "one",
    title: "One",
    streamUrl: "https://media.test/video",
    mediaSourceId: "source",
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
  };
}

function at(positionSeconds: number): PlaybackSnapshot {
  return {
    positionSeconds,
    paused: false,
    buffering: false,
    volume: 100,
    muted: false,
    tracks: [],
    diagnostics: { decodeMode: "software", decodeLabel: "Software", droppedFrames: 0 },
  };
}

class FakePlayer implements PlayerEngine {
  mode = "native" as const;
  listener?: (event: PlayerEvent) => void;
  // The snapshot the engine's stop reports; set it to the position a test asserts.
  stopSnapshot?: PlaybackSnapshot;
  initialize = vi.fn(async () => ({ mode: "native" as const, embedded: true, renderer: "test", nativeRenderer: "test" }));
  subscribe = vi.fn(async (listener: (event: PlayerEvent) => void) => { this.listener = listener; return () => undefined; });
  setSurface = vi.fn(async () => undefined);
  launch = vi.fn(async () => undefined);
  setPaused = vi.fn(async () => undefined);
  seek = vi.fn(async () => undefined);
  setVolume = vi.fn(async () => undefined);
  setMuted = vi.fn(async () => undefined);
  selectTrack = vi.fn(async () => undefined);
  setFullscreen = vi.fn(async () => undefined);
  stop = vi.fn<() => Promise<void>>(async () => {
    if (this.stopSnapshot) this.listener?.({ kind: "ended", snapshot: this.stopSnapshot, reason: "stopped" });
  });
}

function setup() {
  let sessions = 0;
  const gateway = {
    createPlaybackPlan: vi.fn(async () => planFor(`session-${++sessions}`)),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    authorizationHeader: () => "test-header",
    stopActiveEncoding: vi.fn(async () => undefined),
  } as PlaybackGateway;
  const player = new FakePlayer();
  const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
  const emit = async (event: PlayerEvent) => {
    player.listener?.(event);
    await coordinator.flush();
  };
  return { gateway, player, coordinator, emit };
}

const signal = expect.any(AbortSignal);

describe("PlaybackCoordinator retry position (P3-30)", () => {
  it("keeps the start choice when playback fails before the first frame", async () => {
    const { gateway, coordinator, emit } = setup();
    await coordinator.start(item, resume);
    await emit({ kind: "loaded", snapshot: at(12) });
    await emit({ kind: "error", message: "boom" });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(1, item, 120_000_000, signal);
    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, 120_000_000, signal);
  });

  it("retries from the last reported position after a mid-play failure", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(2400);
    await coordinator.start(item, resume);
    await emit({ kind: "loaded", snapshot: at(12) });
    await emit({ kind: "first-frame" });
    await emit({ kind: "state", snapshot: at(2400), cause: "property" });
    await emit({ kind: "error", message: "boom" });
    await emit({ kind: "ended", snapshot: at(2400), reason: "error" });
    await vi.waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledTimes(1));
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, 24_000_000_000, signal);
    expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[1]).toHaveLength(3);
    expect(gateway.reportStopped).toHaveBeenCalledTimes(1);
    expect(gateway.reportStopped).toHaveBeenCalledWith(expect.objectContaining({ playSessionId: "session-1" }), at(2400), signal, true);
  });

  it("ignores a reset position of 0 and keeps the launch resume position", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(0);
    await coordinator.start(item, resume);
    await emit({ kind: "first-frame" });
    await emit({ kind: "error", message: "boom" });
    await emit({ kind: "ended", snapshot: at(0), reason: "error" });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, 120_000_000, signal);
  });

  it("retries from where the viewer seeked, forwards or backwards", async () => {
    const forward = setup();
    forward.player.stopSnapshot = at(300);
    await forward.coordinator.start(item, resume);
    await forward.emit({ kind: "first-frame" });
    await forward.emit({ kind: "state", snapshot: at(2400), cause: "property" });
    await forward.emit({ kind: "state", snapshot: at(300), cause: "seek" });
    await forward.emit({ kind: "error", message: "boom" });
    await forward.coordinator.retry();
    expect(forward.gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, 3_000_000_000, signal);

    const backward = setup();
    backward.player.stopSnapshot = at(60);
    await backward.coordinator.start(item, resume);
    await backward.emit({ kind: "first-frame" });
    await backward.emit({ kind: "state", snapshot: at(2400), cause: "property" });
    await backward.emit({ kind: "state", snapshot: at(60), cause: "seek" });
    await backward.emit({ kind: "error", message: "boom" });
    await backward.coordinator.retry();
    expect(backward.gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, 600_000_000, signal);
  });

  it("uses the stop's final snapshot when the session is still open at the error", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(2410);
    await coordinator.start(item, resume);
    await emit({ kind: "first-frame" });
    await emit({ kind: "state", snapshot: at(2400), cause: "property" });
    await emit({ kind: "error", message: "boom" });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, 24_100_000_000, signal);
  });

  it("keeps the position when the retried attempt fails before its first frame", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(2400);
    await coordinator.start(item, resume);
    await emit({ kind: "first-frame" });
    await emit({ kind: "state", snapshot: at(2400), cause: "property" });
    await emit({ kind: "error", message: "boom" });
    await coordinator.retry();
    player.stopSnapshot = at(0);
    await emit({ kind: "loaded", snapshot: at(0) });
    await emit({ kind: "error", message: "boom again" });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(3, item, 24_000_000_000, signal);
  });

  it("returns to the fallback streams at the current position after a failed renegotiation", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(42);
    await coordinator.start(item, resume);
    await emit({ kind: "first-frame" });
    await emit({ kind: "state", snapshot: at(42), cause: "property" });
    vi.mocked(gateway.createPlaybackPlan).mockRejectedValueOnce(new Error("refused"));
    await expect(coordinator.renegotiate(420_000_000, { audioStreamIndex: 2 }, { audioStreamIndex: 1 })).rejects.toThrow();
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(3, item, 420_000_000, signal, { audioStreamIndex: 1, mediaSourceId: "source" });
  });

  it("starts a new item clean", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(2400);
    await coordinator.start(item, resume);
    await emit({ kind: "first-frame" });
    await emit({ kind: "state", snapshot: at(2400), cause: "property" });
    await coordinator.stop();
    player.stopSnapshot = undefined;
    await coordinator.start(item2);
    await emit({ kind: "loaded", snapshot: at(0) });
    await emit({ kind: "error", message: "boom" });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item2, 0, signal);
  });

  it("lets an explicit position win", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(2400);
    await coordinator.start(item, resume);
    await emit({ kind: "first-frame" });
    await emit({ kind: "state", snapshot: at(2400), cause: "property" });
    await emit({ kind: "error", message: "boom" });
    await coordinator.retry(50_000_000);

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, 50_000_000, signal);
  });
});
