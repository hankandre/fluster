import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEngine, PlayerEvent } from "../../domain/playback";
import { PlaybackCancelledError, PlaybackCoordinator, type PlaybackGateway } from "./coordinator";

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };

function hlsPlan(playSessionId: string): PlaybackPlan {
  return {
    itemId: "one",
    title: "One",
    streamUrl: "https://media.test/videos/one/master.m3u8",
    authorization: 'MediaBrowser Token="secret"',
    mediaSourceId: "source-a",
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
    delivery: "hls",
    playMethod: "Transcode",
    conversionReasons: ["AudioCodecNotSupported"],
    serverUrl: "https://media.test",
    mediaKind: "videos",
  };
}

function staticPlan(playSessionId: string): PlaybackPlan {
  return {
    ...hlsPlan(playSessionId),
    streamUrl: "https://media.test/Videos/one/stream?Static=true",
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
  };
}

const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};

class FakePlayer implements PlayerEngine {
  mode = "native" as const;
  listener?: (event: PlayerEvent) => void;
  constructor(private readonly order: string[] = []) {}
  initialize = vi.fn(async () => ({ mode: "native" as const, embedded: true, renderer: "test", nativeRenderer: "test" }));
  subscribe = vi.fn(async (listener: (event: PlayerEvent) => void) => { this.listener = listener; return () => undefined; });
  setSurface = vi.fn(async () => undefined);
  launch = vi.fn(async (plan: PlaybackPlan) => { this.order.push(`launch ${plan.playSessionId}`); });
  setPaused = vi.fn(async () => undefined);
  seek = vi.fn(async () => undefined);
  setVolume = vi.fn(async () => undefined);
  setMuted = vi.fn(async () => undefined);
  selectTrack = vi.fn(async () => undefined);
  setFullscreen = vi.fn(async () => undefined);
  stop = vi.fn<() => Promise<void>>(async () => { this.order.push("player stop"); });
}

// Records negotiation (with its start and streams), reports, and encode stops in order.
function orderedGateway(order: string[], plans: PlaybackPlan[]) {
  const queue = [...plans];
  const gateway = {
    createPlaybackPlan: vi.fn<PlaybackGateway["createPlaybackPlan"]>(async (_item, ticks, _signal, selection) => {
      const next = queue.shift()!;
      order.push(`negotiate ${ticks} ${JSON.stringify(selection ?? null)} -> ${next.playSessionId}`);
      return next;
    }),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async (stopped: PlaybackPlan, _snapshot: PlaybackSnapshot, _signal?: AbortSignal, failed?: boolean) => {
      order.push(`stopped ${stopped.playSessionId} failed=${String(failed)}`);
    }),
    stopActiveEncoding: vi.fn(async (playSessionId: string) => { order.push(`delete ${playSessionId}`); }),
  };
  return gateway;
}

async function playing(coordinator: PlaybackCoordinator, player: FakePlayer, gateway: { reportStart: ReturnType<typeof vi.fn> }) {
  await coordinator.start(item);
  player.listener?.({ kind: "loaded", snapshot });
  await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
}

describe("PlaybackCoordinator.renegotiate", () => {
  it("stops the old session, reports it stopped (not failed), deletes its encode, then negotiates the streams at the position", async () => {
    const order: string[] = [];
    const gateway = orderedGateway(order, [hlsPlan("play-1"), hlsPlan("play-2")]);
    const player = new FakePlayer(order);
    const onSessionEnded = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn(), onSessionEnded });
    await playing(coordinator, player, gateway);
    order.length = 0;

    const next = await coordinator.renegotiate(420_000_000, { audioStreamIndex: 2, subtitleStreamIndex: -1 });

    expect(next.playSessionId).toBe("play-2");
    expect(order).toEqual([
      "player stop",
      "stopped play-1 failed=false",
      "delete play-1",
      'negotiate 420000000 {"audioStreamIndex":2,"subtitleStreamIndex":-1,"mediaSourceId":"source-a"} -> play-2',
      "launch play-2",
    ]);
    // The item keeps playing: no session end reaches the view.
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("sends no DELETE when the old session played the original file", async () => {
    const order: string[] = [];
    const gateway = orderedGateway(order, [staticPlan("play-1"), hlsPlan("play-2")]);
    const player = new FakePlayer(order);
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
    await playing(coordinator, player, gateway);
    order.length = 0;

    await coordinator.renegotiate(10, { subtitleStreamIndex: -1 });

    expect(order).toEqual([
      "player stop",
      "stopped play-1 failed=false",
      'negotiate 10 {"subtitleStreamIndex":-1,"mediaSourceId":"source-a"} -> play-2',
      "launch play-2",
    ]);
    expect(gateway.stopActiveEncoding).not.toHaveBeenCalled();
  });

  it("keeps the chosen streams for a later Retry, and a plain start asks for none", async () => {
    const order: string[] = [];
    const gateway = orderedGateway(order, [hlsPlan("play-1"), hlsPlan("play-2"), hlsPlan("play-3")]);
    const player = new FakePlayer(order);
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
    await playing(coordinator, player, gateway);

    await coordinator.renegotiate(50, { audioStreamIndex: 3 });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan.mock.calls[0]).toHaveLength(3);
    expect(gateway.createPlaybackPlan.mock.calls[2][3]).toEqual({ audioStreamIndex: 3, mediaSourceId: "source-a" });
    expect(gateway.createPlaybackPlan.mock.calls[2][1]).toBe(50);
  });

  it("Stop during a renegotiation cancels it without waiting for the server", async () => {
    let negotiations = 0;
    const gateway = {
      createPlaybackPlan: vi.fn((_item: LibraryItem, _ticks: number, signal?: AbortSignal) => {
        negotiations += 1;
        if (negotiations === 1) return Promise.resolve(hlsPlan("play-1"));
        // A server that answers only when the request is aborted.
        return new Promise<PlaybackPlan>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      // The old encode's DELETE never answers either.
      stopActiveEncoding: vi.fn(() => new Promise<void>(() => undefined)),
    };
    const player = new FakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
    await playing(coordinator, player, gateway);

    const renegotiation = coordinator.renegotiate(10, { audioStreamIndex: 2 });
    await vi.waitFor(() => expect(gateway.stopActiveEncoding).toHaveBeenCalled());
    await coordinator.stop();

    await expect(renegotiation).rejects.toBeInstanceOf(PlaybackCancelledError);
    expect(player.launch).toHaveBeenCalledTimes(1);
  });
});
