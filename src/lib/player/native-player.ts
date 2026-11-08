import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  PlaybackRefusedError,
  type PlayerCapabilities,
  type PlaybackPlan,
  type PlayerEngine,
  type PlayerEvent,
  type PlayerSurfaceFrame,
} from "../../domain/playback";

// Rust starts every refusal of a converted stream with this text
// (`MpvError::UnsafeConversion`, src-tauri/src/player/mod.rs): the master URL
// broke the HLS URL rules, or a playlist or subtitle failed Rust's checks.
// The rest of the message is fixed text and never names a URL or a body.
export const UNSAFE_CONVERSION_PREFIX = "Fluster refused the converted stream:";

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

  // The header travels as its own typed LaunchRequest field, so Rust can
  // validate it and give it to libmpv as a fixed HTTP header. The plan's
  // typed `delivery` field picks Rust's static or HLS path (P10-04).
  async launch(plan: PlaybackPlan): Promise<void> {
    const { authorization, ...launchPlan } = plan;
    try {
      await invoke("launch_playback", { request: { plan: launchPlan, authorization, testForceSoftware: false } });
    } catch (error) {
      if (typeof error === "string" && error.startsWith(UNSAFE_CONVERSION_PREFIX)) {
        throw new PlaybackRefusedError({ reason: "unsafe-transcoding-url", detail: "converted stream checks" });
      }
      throw error;
    }
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
