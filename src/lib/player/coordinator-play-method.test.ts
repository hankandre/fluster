import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEngine, PlayerEvent, ServerPlayMethod } from "../../domain/playback";
import { PlaybackCoordinator, type PlaybackGateway } from "./coordinator";

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };
const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software — CPU", droppedFrames: 0 },
};
const audio = { index: 1, type: "Audio" as const, displayTitle: "AC3", external: false };
const hls: PlaybackPlan = {
  itemId: "one",
  title: "One",
  streamUrl: "https://media.test/videos/one/master.m3u8",
  authorization: 'MediaBrowser Token="secret"',
  mediaSourceId: "source",
  playSessionId: "session",
  startPositionTicks: 0,
  tracks: [audio],
  delivery: "hls",
  playMethod: "Transcode",
  conversionReasons: ["DirectPlayError"],
  serverUrl: "https://media.test",
  mediaKind: "videos",
};
const copies: ServerPlayMethod = { playMethod: "Transcode", videoDirect: true, audioDirect: true, reasons: ["AudioCodecNotSupported"] };

class FakePlayer implements PlayerEngine {
  mode = "native" as const;
  listener?: (event: PlayerEvent) => void;
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
  stop = vi.fn<() => Promise<void>>(async () => undefined);
}

function setup(planned: PlaybackPlan, answers: (() => Promise<ServerPlayMethod | undefined>)[]) {
  const queue = [...answers];
  const gateway = {
    createPlaybackPlan: vi.fn(async () => planned),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    stopActiveEncoding: vi.fn(async () => undefined),
    sessionPlayMethod: vi.fn(async () => (queue.shift() ?? (async () => undefined))()),
  } satisfies PlaybackGateway;
  const player = new FakePlayer();
  const onPlanConfirmed = vi.fn();
  const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn(), onPlanConfirmed });
  return { gateway, player, coordinator, onPlanConfirmed };
}

async function playToFirstFrame(context: ReturnType<typeof setup>): Promise<void> {
  await context.coordinator.start(item);
  context.player.listener?.({ kind: "loaded", snapshot });
  context.player.listener?.({ kind: "first-frame" });
  await vi.advanceTimersByTimeAsync(0);
}

describe("PlaybackCoordinator play-method confirmation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks the server 3 s after the first frame, shows DirectStream once it says it copies, and keeps reporting Transcode", async () => {
    const context = setup(hls, [async () => copies]);
    await playToFirstFrame(context);
    expect(context.gateway.reportStart).toHaveBeenCalledWith(hls, snapshot, expect.any(AbortSignal));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(context.gateway.sessionPlayMethod).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(context.gateway.sessionPlayMethod).toHaveBeenCalledWith(hls, expect.any(AbortSignal));
    const confirmed = { ...hls, playMethod: "DirectStream", conversionReasons: ["DirectPlayError", "AudioCodecNotSupported"] };
    expect(context.onPlanConfirmed).toHaveBeenCalledWith(confirmed);

    // The UI plan is confirmed, but the 10 s progress tick, a pause, and the
    // stopped report keep PlayMethod Transcode so the server keeps the job's
    // TranscodingInfo (ClearTranscodingInfo runs on a non-Transcode report).
    const reported = { ...confirmed, playMethod: "Transcode" };
    await vi.advanceTimersByTimeAsync(7_000);
    expect(context.gateway.reportProgress).toHaveBeenLastCalledWith(reported, snapshot, expect.any(AbortSignal));
    context.player.listener?.({ kind: "state", snapshot, cause: "pause" });
    await vi.advanceTimersByTimeAsync(0);
    expect(context.gateway.reportProgress).toHaveBeenLastCalledWith(reported, snapshot, expect.any(AbortSignal));
    await context.coordinator.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(context.gateway.reportStopped).toHaveBeenCalledWith(reported, snapshot, expect.any(AbortSignal), false);
    const calls = [context.gateway.reportStart, context.gateway.reportProgress, context.gateway.reportStopped].flatMap((report) => report.mock.calls as unknown[][]);
    expect(calls.length).toBeGreaterThan(3);
    for (const call of calls) expect((call[0] as PlaybackPlan).playMethod).toBe("Transcode");
    expect(context.gateway.sessionPlayMethod).toHaveBeenCalledTimes(1);
  });

  it("asks once more at 10 s when the server had no TranscodingInfo yet", async () => {
    const context = setup(hls, [async () => undefined, async () => copies]);
    await playToFirstFrame(context);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(context.onPlanConfirmed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6_999);
    expect(context.gateway.sessionPlayMethod).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(context.gateway.sessionPlayMethod).toHaveBeenCalledTimes(2);
    expect(context.onPlanConfirmed).toHaveBeenCalledWith(expect.objectContaining({ playMethod: "DirectStream" }));
  });

  it("keeps Transcode when the query fails, and never asks a third time", async () => {
    const context = setup(hls, [async () => { throw new Error("offline"); }, async () => { throw new Error("offline"); }]);
    await playToFirstFrame(context);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(context.gateway.sessionPlayMethod).toHaveBeenCalledTimes(2);
    expect(context.onPlanConfirmed).not.toHaveBeenCalled();
    await context.coordinator.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(context.gateway.reportStopped).toHaveBeenCalledWith(hls, snapshot, expect.any(AbortSignal), false);
  });

  it("downgrades a provisional DirectStream the server re-encodes", async () => {
    const context = setup({ ...hls, playMethod: "DirectStream", conversionReasons: ["ContainerNotSupported"] }, [
      async () => ({ playMethod: "DirectStream", videoDirect: true, audioDirect: false, reasons: [] }),
    ]);
    await playToFirstFrame(context);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(context.onPlanConfirmed).toHaveBeenCalledWith(expect.objectContaining({ playMethod: "Transcode" }));
  });

  it("reports a provisional DirectStream HLS plan as Transcode from the start", async () => {
    const context = setup({ ...hls, playMethod: "DirectStream", conversionReasons: ["ContainerNotSupported"] }, []);
    await playToFirstFrame(context);
    expect(context.gateway.reportStart).toHaveBeenCalledWith(expect.objectContaining({ playMethod: "Transcode" }), snapshot, expect.any(AbortSignal));
  });

  it("never asks for a direct-play session", async () => {
    const context = setup({ ...hls, delivery: "static", playMethod: "DirectPlay", conversionReasons: [] } as PlaybackPlan, [async () => copies]);
    await playToFirstFrame(context);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(context.gateway.sessionPlayMethod).not.toHaveBeenCalled();
  });

  it("drops the check when the session stops first, and leaving never waits for it", async () => {
    let release: (value: ServerPlayMethod) => void = () => undefined;
    const context = setup(hls, [() => new Promise((resolve) => { release = resolve; })]);
    await playToFirstFrame(context);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(context.gateway.sessionPlayMethod).toHaveBeenCalledTimes(1);
    const signal = (context.gateway.sessionPlayMethod.mock.calls[0] as unknown[])[1] as AbortSignal;
    await context.coordinator.stop();
    expect(signal.aborted).toBe(true);
    release(copies);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(context.onPlanConfirmed).not.toHaveBeenCalled();
  });

  it("does not ask when the session ends before 3 s", async () => {
    const context = setup(hls, [async () => copies]);
    await playToFirstFrame(context);
    await vi.advanceTimersByTimeAsync(1_000);
    await context.coordinator.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(context.gateway.sessionPlayMethod).not.toHaveBeenCalled();
  });
});
