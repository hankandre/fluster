import { describe, expect, it, vi } from "vitest";
import type { LibraryItem, PlaybackPlan, PlaybackSnapshot, PlayerEngine, PlayerEvent } from "../../domain/playback";
import type { JellyfinGateway } from "../jellyfin/gateway";
import { PlaybackCoordinator } from "./coordinator";

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
  stop = vi.fn(async () => undefined);
}

describe("PlaybackCoordinator", () => {
  it("reports after load, on pause/seek, and on completion", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as unknown as JellyfinGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalledWith(plan, snapshot));
    player.listener?.({ kind: "state", snapshot: { ...snapshot, paused: true }, cause: "pause" });
    await vi.waitFor(() => expect(gateway.reportProgress).toHaveBeenCalled());
    player.listener?.({ kind: "ended", snapshot, reason: "eof" });
    await vi.waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot));
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
    } as unknown as JellyfinGateway;
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    });

    await coordinator.start(item, { kind: "resume", startPositionTicks: item.resumePositionTicks });
    player.listener?.({ kind: "error", message: "load failed" });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(1, item, item.resumePositionTicks);
    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, item.resumePositionTicks);
    expect(player.launch).toHaveBeenNthCalledWith(1, plan);
    expect(player.launch).toHaveBeenNthCalledWith(2, replacementPlan);
  });

  it("refuses to relaunch a retry with the failed play-session ID", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
    } as unknown as JellyfinGateway;
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
    } as unknown as JellyfinGateway;
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
    } as unknown as JellyfinGateway;
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
      expect(gateway.reportProgress).toHaveBeenCalledWith(plan, snapshot);
      await coordinator.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
