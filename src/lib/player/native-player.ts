import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  UnsupportedDeliveryError,
  type PlayerCapabilities,
  type PlaybackPlan,
  type PlayerEngine,
  type PlayerEvent,
  type PlayerSurfaceFrame,
} from "../../domain/playback";

export const NATIVE_HLS_UNSUPPORTED_MESSAGE =
  "This item needs a server conversion, and the desktop player cannot play converted streams yet.";

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
  // validate it and give it to libmpv as a fixed HTTP header.
  // Until P10-04 wires the typed HLS path, only static plans reach Rust: an
  // hls plan is refused here, before any invoke.
  async launch(plan: PlaybackPlan): Promise<void> {
    if (plan.delivery !== "static") {
      throw new UnsupportedDeliveryError("native", plan.delivery, NATIVE_HLS_UNSUPPORTED_MESSAGE);
    }
    const { authorization, ...launchPlan } = plan;
    await invoke("launch_playback", { request: { plan: launchPlan, authorization, testForceSoftware: false } });
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
