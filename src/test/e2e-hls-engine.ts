import type {
  PlaybackPlan,
  PlaybackSnapshot,
  PlayerCapabilities,
  PlayerEngine,
  PlayerEvent,
} from "../domain/playback";

// Marker the production build must never contain (scripts/check-no-test-engine.sh).
export const E2E_HLS_ENGINE_MARKER = "FLUSTER_E2E_FAKE_HLS_ENGINE";

// Test-only engine for the e2e build (VITE_FLUSTER_E2E_ENGINE=fake-hls). It
// accepts any plan, requests no media, and reports a playing snapshot, so
// Playwright can reach the conversion indicator the browser engine cannot.
export class E2eHlsEngine implements PlayerEngine {
  readonly mode = "browser" as const;
  readonly marker = E2E_HLS_ENGINE_MARKER;
  private listeners = new Set<(event: PlayerEvent) => void>();

  async initialize(): Promise<PlayerCapabilities> {
    return { mode: "browser", embedded: true, renderer: "e2e", nativeRenderer: "e2e" };
  }

  async subscribe(listener: (event: PlayerEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setSurface(): Promise<void> {}

  async launch(plan: PlaybackPlan): Promise<void> {
    const snapshot = this.snapshot(plan.startPositionTicks / 10_000_000);
    queueMicrotask(() => {
      this.emit({ kind: "loaded", snapshot });
      this.emit({ kind: "first-frame" });
      this.emit({ kind: "state", snapshot, cause: "property" });
    });
  }

  async setPaused(): Promise<void> {}
  async seek(): Promise<void> {}
  async setVolume(): Promise<void> {}
  async setMuted(): Promise<void> {}
  async selectTrack(): Promise<void> {}
  async setFullscreen(): Promise<void> {}

  async stop(): Promise<void> {
    this.emit({ kind: "ended", snapshot: this.snapshot(0), reason: "stopped" });
  }

  private snapshot(positionSeconds: number): PlaybackSnapshot {
    return {
      positionSeconds,
      durationSeconds: 120,
      paused: false,
      buffering: false,
      volume: 100,
      muted: false,
      tracks: [],
      diagnostics: { decodeMode: "unknown", decodeLabel: "E2E engine", droppedFrames: 0 },
    };
  }

  private emit(event: PlayerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
