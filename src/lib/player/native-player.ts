import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  PlayerCapabilities,
  PlaybackPlan,
  PlayerEngine,
  PlayerEvent,
  PlayerSurfaceFrame,
} from "../../domain/playback";

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export class NativePlayerEngine implements PlayerEngine {
  readonly mode = "native" as const;

  initialize(): Promise<PlayerCapabilities> {
    return invoke("initialize_player");
  }

  async subscribe(listener: (event: PlayerEvent) => void): Promise<() => void> {
    return listen<PlayerEvent>("fluster://player-event", ({ payload }) => listener(payload));
  }

  setSurface(frame: PlayerSurfaceFrame): Promise<void> {
    return invoke("set_player_surface", { frame });
  }

  async launch(plan: PlaybackPlan): Promise<void> {
    await invoke("launch_playback", { request: { plan, testForceSoftware: false } });
  }

  setPaused(paused: boolean): Promise<void> {
    return invoke("set_paused", { paused });
  }

  seek(positionSeconds: number): Promise<void> {
    return invoke("seek_absolute", { positionSeconds });
  }

  setVolume(volume: number): Promise<void> {
    return invoke("set_volume", { volume });
  }

  setMuted(muted: boolean): Promise<void> {
    return invoke("set_muted", { muted });
  }

  selectTrack(type: "audio" | "subtitle", id?: number): Promise<void> {
    return invoke("select_track", { trackType: type, id: id ?? null });
  }

  setFullscreen(fullscreen: boolean): Promise<void> {
    return invoke("set_fullscreen", { fullscreen });
  }

  stop(): Promise<void> {
    return invoke("stop_playback");
  }
}
