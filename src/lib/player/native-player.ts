import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  PlaybackRefusedError,
  type LaunchAuthorization,
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

// Every native command returns `Result<_, String>`, so `invoke` rejects with a
// bare string. Make it an Error so every reader reads failures one way.
function toNativeError(error: unknown): unknown {
  return typeof error === "string" ? new Error(error) : error;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toNativeError(error);
  }
}

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export class NativePlayerEngine implements PlayerEngine {
  readonly mode = "native" as const;

  initialize(): Promise<PlayerCapabilities> {
    return call("initialize_player");
  }

  async subscribe(listener: (event: PlayerEvent) => void): Promise<() => void> {
    return listen<PlayerEvent>("fluster://player-event", ({ payload }) => listener(payload));
  }

  setSurface(frame: PlayerSurfaceFrame): Promise<void> {
    return call("set_player_surface", { frame });
  }

  // The header travels as its own typed LaunchRequest field, so Rust can
  // validate it and give it to libmpv as a fixed HTTP header. The plan's
  // typed `delivery` field picks Rust's static or HLS path (P10-04).
  async launch(plan: PlaybackPlan, readAuthorization: LaunchAuthorization): Promise<void> {
    try {
      await invoke("launch_playback", {
        request: { plan, authorization: readAuthorization(), testForceSoftware: false },
      });
    } catch (error) {
      if (typeof error === "string" && error.startsWith(UNSAFE_CONVERSION_PREFIX)) {
        throw new PlaybackRefusedError({ reason: "unsafe-transcoding-url", detail: "converted stream checks" });
      }
      throw toNativeError(error);
    }
  }

  setPaused(paused: boolean): Promise<void> {
    return call("set_paused", { paused });
  }

  seek(positionSeconds: number): Promise<void> {
    return call("seek_absolute", { positionSeconds });
  }

  setVolume(volume: number): Promise<void> {
    return call("set_volume", { volume });
  }

  setMuted(muted: boolean): Promise<void> {
    return call("set_muted", { muted });
  }

  selectTrack(type: "audio" | "subtitle", id?: number): Promise<void> {
    return call("select_track", { trackType: type, id: id ?? null });
  }

  setFullscreen(fullscreen: boolean): Promise<void> {
    return call("set_fullscreen", { fullscreen });
  }

  stop(): Promise<void> {
    return call("stop_playback");
  }
}
