import type {
  PlaybackPlan,
  PlaybackSnapshot,
  PlayerCapabilities,
  PlayerEngine,
  PlayerEvent,
  PlayerTrack,
} from "../domain/playback";

// Marker the production build must never contain (scripts/check-no-test-engine.sh).
export const E2E_HLS_ENGINE_MARKER = "FLUSTER_E2E_FAKE_HLS_ENGINE";

// Test-only engine for the e2e build (VITE_FLUSTER_E2E_ENGINE=fake-hls). It
// accepts any plan, requests no media, and reports a playing snapshot, so
// Playwright can reach the conversion indicator the browser engine cannot.
// Like the native engine on a converted session, it lists only the requested
// audio stream and the subtitle files, mapped to their Jellyfin indices.
export class E2eHlsEngine implements PlayerEngine {
  readonly mode = "browser" as const;
  readonly marker = E2E_HLS_ENGINE_MARKER;
  private listeners = new Set<(event: PlayerEvent) => void>();
  private positionSeconds = 0;
  private tracks: PlayerTrack[] = [];

  async initialize(): Promise<PlayerCapabilities> {
    return { mode: "browser", embedded: true, renderer: "e2e", nativeRenderer: "e2e" };
  }

  async subscribe(listener: (event: PlayerEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setSurface(): Promise<void> {}

  async launch(plan: PlaybackPlan): Promise<void> {
    this.positionSeconds = plan.startPositionTicks / 10_000_000;
    this.tracks = carriedTracks(plan);
    const snapshot = this.snapshot();
    queueMicrotask(() => {
      this.emit({ kind: "loaded", snapshot });
      this.emit({ kind: "first-frame" });
      this.emit({ kind: "state", snapshot, cause: "property" });
    });
  }

  async setPaused(): Promise<void> {}
  async seek(positionSeconds: number): Promise<void> {
    this.positionSeconds = positionSeconds;
    const snapshot = this.snapshot();
    queueMicrotask(() => this.emit({ kind: "state", snapshot, cause: "seek" }));
  }

  async setVolume(): Promise<void> {}
  async setMuted(): Promise<void> {}
  async selectTrack(type: "audio" | "subtitle", id?: number): Promise<void> {
    const kind = type === "audio" ? "Audio" : "Subtitle";
    this.tracks = this.tracks.map((track) => track.type === kind ? { ...track, selected: track.playerId === id } : track);
    const snapshot = this.snapshot();
    queueMicrotask(() => this.emit({ kind: "tracks-changed", snapshot }));
  }
  async setFullscreen(): Promise<void> {}

  async stop(): Promise<void> {
    this.emit({ kind: "ended", snapshot: this.snapshot(), reason: "stopped" });
  }

  private snapshot(): PlaybackSnapshot {
    const selected = (type: PlayerTrack["type"]) => this.tracks.find((track) => track.type === type && track.selected)?.jellyfinIndex;
    return {
      positionSeconds: this.positionSeconds,
      durationSeconds: 120,
      paused: false,
      buffering: false,
      volume: 100,
      muted: false,
      audioTrack: selected("Audio"),
      subtitleTrack: selected("Subtitle"),
      tracks: this.tracks,
      diagnostics: { decodeMode: "unknown", decodeLabel: "E2E engine", droppedFrames: 0 },
    };
  }

  private emit(event: PlayerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

// The requested audio stream and every subtitle with a delivery URL.
function carriedTracks(plan: PlaybackPlan): PlayerTrack[] {
  const audio = plan.tracks.filter((track) => track.type === "Audio" && track.index === plan.defaultAudioStreamIndex);
  const subtitles = plan.tracks.filter((track) => track.type === "Subtitle" && track.deliveryUrl);
  return [
    ...audio.map((track, position) => ({
      playerId: position + 1,
      jellyfinIndex: track.index,
      type: "Audio" as const,
      title: track.displayTitle,
      external: false,
      selected: true,
    })),
    ...subtitles.map((track, position) => ({
      playerId: position + 1,
      jellyfinIndex: track.index,
      type: "Subtitle" as const,
      title: track.displayTitle,
      external: true,
      selected: track.index === plan.defaultSubtitleStreamIndex,
    })),
  ];
}
