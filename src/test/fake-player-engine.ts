import { vi } from "vitest";
import type { PlayerCapabilities, PlayerEngine, PlayerEvent } from "../domain/playback";

// A PlayerEngine of vi.fn()s. Tests drive playback by calling emit().
export class FakePlayerEngine implements PlayerEngine {
  readonly mode = "browser" as const;
  private listener?: (event: PlayerEvent) => void;

  initialize = vi.fn(async (): Promise<PlayerCapabilities> => ({
    mode: "browser",
    embedded: true,
    renderer: "test",
    nativeRenderer: "test",
  }));
  subscribe = vi.fn(async (listener: (event: PlayerEvent) => void) => {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  });
  setSurface = vi.fn(async () => undefined);
  launch = vi.fn(async () => undefined);
  setPaused = vi.fn(async () => undefined);
  seek = vi.fn(async () => undefined);
  setVolume = vi.fn(async () => undefined);
  setMuted = vi.fn(async () => undefined);
  selectTrack = vi.fn(async () => undefined);
  setFullscreen = vi.fn(async () => undefined);
  stop = vi.fn(async () => undefined);

  emit(event: PlayerEvent): void {
    this.listener?.(event);
  }
}
