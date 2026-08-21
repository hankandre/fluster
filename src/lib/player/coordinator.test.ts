import { describe, expect, it, vi } from "vitest";
import type { LibraryItem, PlaybackPlan, PlaybackSnapshot, PlayerEngine, PlayerEvent } from "../../domain/playback";
import type { JellyfinGateway } from "../jellyfin/gateway";
import { PlaybackCoordinator } from "./coordinator";

const item: LibraryItem = { id: "one", name: "One", type: "Movie" };
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
  initialize = vi.fn(async () => ({ mode: "native" as const, embedded: true, renderer: "test" }));
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
});
