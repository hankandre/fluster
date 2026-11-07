import { redactText } from "../redact";
import type {
  PlaybackDiagnostics,
  PlaybackPlan,
  PlaybackSnapshot,
  PlayerCapabilities,
  PlayerEngine,
  PlayerEvent,
  PlayerSurfaceFrame,
} from "../../domain/playback";

const browserDiagnostics: PlaybackDiagnostics = {
  decodeMode: "unknown",
  decodeLabel: "Browser — unverified",
  droppedFrames: 0,
  warning: "Browser playback does not report authoritative hardware-decoding diagnostics.",
};

const BROWSER_PLAYBACK_ERROR =
  "The browser could not play the direct file. Browser development mode sends no authorization with media requests, so a server that requires it will refuse; try the desktop app.";

export class BrowserPlayerEngine implements PlayerEngine {
  readonly mode = "browser" as const;
  private video?: HTMLVideoElement;
  private listeners = new Set<(event: PlayerEvent) => void>();

  async initialize(): Promise<PlayerCapabilities> {
    return {
      mode: "browser",
      embedded: true,
      renderer: "html-video",
      nativeRenderer: "browser-html-video",
    };
  }

  async subscribe(listener: (event: PlayerEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setSurface(_frame: PlayerSurfaceFrame): Promise<void> {}

  async launch(plan: PlaybackPlan): Promise<void> {
    await this.stop(false);
    const host = document.querySelector<HTMLElement>("[data-browser-video-host]");
    if (!host) throw new Error("The in-app browser video surface is not ready.");
    const video = document.createElement("video");
    video.className = "browser-player";
    video.autoplay = true;
    video.playsInline = true;
    // A <video> element cannot send an Authorization header, and tokens never
    // go in URLs (invariant I4), so this requests the token-free URL. Jellyfin
    // 10.11.7 and 12.4 serve the static stream route anonymously, so it plays;
    // a server or proxy that requires auth on it will refuse.
    video.src = plan.streamUrl;
    host.append(video);
    this.video = video;
    const emitState = (cause: "pause" | "seek" | "property" = "property") =>
      this.emit({ kind: "state", snapshot: this.snapshot(), cause });
    video.addEventListener("loadedmetadata", () => {
      if (plan.startPositionTicks > 0) video.currentTime = plan.startPositionTicks / 10_000_000;
      this.emit({ kind: "loaded", snapshot: this.snapshot() });
      this.emit({ kind: "first-frame" });
    });
    video.addEventListener("timeupdate", () => emitState());
    video.addEventListener("pause", () => emitState("pause"));
    video.addEventListener("play", () => emitState("pause"));
    video.addEventListener("waiting", () => emitState());
    video.addEventListener("playing", () => emitState());
    video.addEventListener("seeked", () => emitState("seek"));
    video.addEventListener("volumechange", () => emitState());
    video.addEventListener("ended", () => this.emit({ kind: "ended", snapshot: this.snapshot(), reason: "eof" }));
    video.addEventListener("error", () => this.emit({ kind: "error", message: BROWSER_PLAYBACK_ERROR }));
    try {
      await video.play();
    } catch (error) {
      this.emit({ kind: "error", message: error instanceof Error ? redactText(error.message) : "Browser playback failed." });
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    if (!this.video) return;
    if (paused) this.video.pause();
    else await this.video.play();
  }

  async seek(positionSeconds: number): Promise<void> {
    if (this.video) this.video.currentTime = Math.max(0, positionSeconds);
  }

  async setVolume(volume: number): Promise<void> {
    if (this.video) this.video.volume = Math.max(0, Math.min(1, volume / 100));
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.video) this.video.muted = muted;
  }

  async selectTrack(type: "audio" | "subtitle", id?: number): Promise<void> {
    if (type === "subtitle" && this.video) {
      for (let index = 0; index < this.video.textTracks.length; index += 1) {
        this.video.textTracks[index].mode = index === id ? "showing" : "disabled";
      }
    }
  }

  async setFullscreen(fullscreen: boolean): Promise<void> {
    const host = this.video?.parentElement;
    if (fullscreen && host) await host.requestFullscreen();
    else if (!fullscreen && document.fullscreenElement) await document.exitFullscreen();
  }

  async stop(emit = true): Promise<void> {
    if (!this.video) return;
    const snapshot = this.snapshot();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    this.video = undefined;
    if (emit) this.emit({ kind: "ended", snapshot, reason: "stopped" });
  }

  private snapshot(): PlaybackSnapshot {
    const video = this.video;
    return {
      positionSeconds: video?.currentTime ?? 0,
      durationSeconds: Number.isFinite(video?.duration) ? video?.duration : undefined,
      paused: video?.paused ?? true,
      buffering: video?.readyState != null ? video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA : false,
      volume: Math.round((video?.volume ?? 1) * 100),
      muted: video?.muted ?? false,
      tracks: [],
      diagnostics: browserDiagnostics,
    };
  }

  private emit(event: PlayerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
