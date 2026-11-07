import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEngine, PlayerEvent } from "../../domain/playback";
import { PlaybackCancelledError, PlaybackCoordinator, type PlaybackGateway } from "./coordinator";

const item: LibraryItem = {
  id: "one",
  name: "One",
  type: "Movie",
  resumePositionTicks: 120_000_000,
  played: false,
};
const plan: PlaybackPlan = {
  itemId: "one",
  title: "One",
  streamUrl: "https://media.test/video?api_key=secret",
  mediaSourceId: "source",
  playSessionId: "session",
  startPositionTicks: 0,
  tracks: [],
};
const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software — CPU", droppedFrames: 0 },
};

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
  launch = vi.fn(async () => undefined);
  setPaused = vi.fn(async () => undefined);
  seek = vi.fn(async () => undefined);
  setVolume = vi.fn(async () => undefined);
  setMuted = vi.fn(async () => undefined);
  selectTrack = vi.fn(async () => undefined);
  setFullscreen = vi.fn(async () => undefined);
  stop = vi.fn<() => Promise<void>>(async () => undefined);
}

describe("PlaybackCoordinator", () => {
  it("reports after load, on pause/seek, and on completion", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal)));
    player.listener?.({ kind: "state", snapshot: { ...snapshot, paused: true }, cause: "pause" });
    await vi.waitFor(() => expect(gateway.reportProgress).toHaveBeenCalled());
    player.listener?.({ kind: "ended", snapshot, reason: "eof" });
    await vi.waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), false));
  });

  it("renegotiates PlaybackInfo and replaces the authenticated session on retry", async () => {
    const replacementPlan = {
      ...plan,
      streamUrl: "https://media.test/video?api_key=new-secret",
      playSessionId: "session-2",
    };
    const gateway = {
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce(replacementPlan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    });

    await coordinator.start(item, { kind: "resume", startPositionTicks: item.resumePositionTicks });
    player.listener?.({ kind: "error", message: "load failed" });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(1, item, item.resumePositionTicks, expect.any(AbortSignal));
    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, item.resumePositionTicks, expect.any(AbortSignal));
    expect(player.launch).toHaveBeenNthCalledWith(1, plan);
    expect(player.launch).toHaveBeenNthCalledWith(2, replacementPlan);
  });

  it("refuses to relaunch a retry with the failed play-session ID", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    });

    await coordinator.start(item);
    await expect(coordinator.retry()).rejects.toThrow("reused the failed playback session");
    expect(player.launch).toHaveBeenCalledTimes(1);
  });

  it("serializes start, track-change, seek, and stop reports", async () => {
    const reportOrder: string[] = [];
    const record = async (name: string) => {
      reportOrder.push(`${name}:start`);
      await Promise.resolve();
      reportOrder.push(`${name}:done`);
    };
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(() => record("start")),
      reportProgress: vi.fn(() => record("progress")),
      reportStopped: vi.fn(() => record("stop")),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    });

    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    player.listener?.({ kind: "tracks-changed", snapshot });
    player.listener?.({ kind: "state", snapshot, cause: "seek" });
    player.listener?.({ kind: "ended", snapshot, reason: "eof" });
    await coordinator.flush();

    expect(reportOrder).toEqual([
      "start:start", "start:done",
      "progress:start", "progress:done",
      "progress:start", "progress:done",
      "stop:start", "stop:done",
    ]);
  });

  it("reports periodic progress through the same queue", async () => {
    vi.useFakeTimers();
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    });

    try {
      await coordinator.start(item);
      player.listener?.({ kind: "loaded", snapshot });
      await coordinator.flush();
      await vi.advanceTimersByTimeAsync(10_000);
      await coordinator.flush();
      expect(gateway.reportProgress).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal));
      await coordinator.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels negotiation before it can subscribe or launch", async () => {
    let resolvePlan!: (value: PlaybackPlan) => void;
    const gateway = {
      createPlaybackPlan: vi.fn(() => new Promise<PlaybackPlan>((resolve) => { resolvePlan = resolve; })),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    });

    const starting = coordinator.start(item);
    await vi.waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalled());
    const stopping = coordinator.stop();
    resolvePlan(plan);

    await expect(starting).rejects.toBeInstanceOf(PlaybackCancelledError);
    await stopping;
    expect(player.subscribe).not.toHaveBeenCalled();
    expect(player.launch).not.toHaveBeenCalled();
  });

  it("delivers later player events while a report is still pending", async () => {
    let finishReport!: () => void;
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(() => new Promise<void>((resolve) => { finishReport = resolve; })),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const onEvent = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent,
      onReportingError: vi.fn(),
    });

    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    player.listener?.({ kind: "state", snapshot: { ...snapshot, positionSeconds: 43 } });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
    finishReport();
    await coordinator.stop();
  });

  it("returns to the library without waiting for final reporting", async () => {
    let finishStartReport!: () => void;
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(() => new Promise<void>((resolve) => { finishStartReport = resolve; })),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const onSessionEnded = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
      onSessionEnded,
    });

    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());

    await coordinator.stop();

    expect(onSessionEnded).toHaveBeenCalledWith("stopped");
    expect(gateway.reportStopped).not.toHaveBeenCalled();

    finishStartReport();
    await coordinator.flush();
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), false);
  });

  it("keeps the player mounted until native teardown finishes", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    let finishNativeStop!: () => void;
    player.stop.mockImplementation(() => new Promise<void>((resolve) => {
      finishNativeStop = resolve;
    }));
    const onEvent = vi.fn();
    const onSessionEnded = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent,
      onReportingError: vi.fn(),
      onSessionEnded,
    });

    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    const stopping = coordinator.stop();
    await vi.waitFor(() => expect(player.stop).toHaveBeenCalled());

    player.listener?.({ kind: "ended", snapshot, reason: "stopped" });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "ended" }),
    ));
    expect(onSessionEnded).not.toHaveBeenCalled();

    finishNativeStop();
    await stopping;
    expect(onSessionEnded).toHaveBeenCalledWith("stopped");
  });

  it("bounds final report draining when the transport ignores cancellation", async () => {
    vi.useFakeTimers();
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(() => new Promise<void>(() => undefined)),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const onReportingError = vi.fn();
    const onSessionEnded = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError,
      onSessionEnded,
    });

    try {
      await coordinator.start(item);
      player.listener?.({ kind: "loaded", snapshot });
      player.listener?.({ kind: "ended", snapshot, reason: "eof" });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(onReportingError).toHaveBeenCalledWith(expect.stringContaining("shutdown deadline"));
      expect(onSessionEnded).toHaveBeenCalledWith("eof");
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets Back return without waiting for a hung stopped report from the previous attempt", async () => {
    const replacementPlan = { ...plan, playSessionId: "session-2" };
    const gateway = {
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce(replacementPlan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      // A server that never answers and ignores cancellation.
      reportStopped: vi.fn(() => new Promise<void>(() => undefined)),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    });

    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalledTimes(1));
    const retrying = coordinator.retry().catch(() => undefined);
    await vi.waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledTimes(1));

    const outcome = await Promise.race([
      coordinator.stop().then(() => "returned"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 200)),
    ]);
    await retrying;

    expect(outcome).toBe("returned");
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
  });

  it("does not relaunch when stop overtakes a retry", async () => {
    const replacementPlan = { ...plan, playSessionId: "session-2" };
    const gateway = {
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce(replacementPlan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    let finishStop!: () => void;
    const stoppingPlayer = new Promise<void>((resolve) => { finishStop = resolve; });
    player.stop.mockImplementation(() => stoppingPlayer);
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    });

    await coordinator.start(item);
    const retrying = coordinator.retry();
    await vi.waitFor(() => expect(player.stop).toHaveBeenCalledTimes(1));
    const stopping = coordinator.stop();
    finishStop();

    await expect(retrying).rejects.toBeInstanceOf(PlaybackCancelledError);
    await stopping;
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
    expect(player.launch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an error ending", { kind: "ended", snapshot, reason: "error" } as PlayerEvent, true],
    ["a recovered error event before eof", { kind: "ended", snapshot, reason: "eof" } as PlayerEvent, false],
    ["a normal eof", { kind: "ended", snapshot, reason: "eof" } as PlayerEvent, false],
  ])("sends Failed correctly for %s", async (name, ending, failed) => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
    if (name === "a recovered error event before eof") player.listener?.({ kind: "error", message: "decode failed" });
    player.listener?.(ending);
    await vi.waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), failed));
  });

  it("marks the stop sent by a retry after an error as failed", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce({ ...plan, playSessionId: "session-2" }),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
    player.listener?.({ kind: "error", message: "stalled" });
    await coordinator.retry();
    await coordinator.flush();
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), true);
  });

  it("sends a failed stopped report when launch fails after the start was reported", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = new FakePlayer();
    player.launch.mockImplementation(async () => {
      player.listener?.({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      throw new Error("launch failed");
    });
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });

    await expect(coordinator.start(item)).rejects.toThrow("launch failed");
    await coordinator.flush();

    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), true);
  });
});
