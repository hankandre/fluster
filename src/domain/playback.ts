import type { LibraryItem } from "./catalog";

export const TICKS_PER_SECOND = 10_000_000;

export const PLAYBACK_POLICY = Object.freeze({
  allowServerTranscoding: false,
  allowServerRemux: false,
  preferHardwareDecode: true,
  allowSoftwareDecode: true,
});

// Why Fluster refused every media source a PlaybackInfo response offered.
// Each value maps to one source-acceptance rule in ARCHITECTURE.md §3.
export type RefusalReason =
  | "no-sources"
  | "no-direct-play"
  | "not-a-file"
  | "live-source"
  | "server-requires-transcoding"
  | "disc-source"
  | "iso-source"
  | "missing-source-data";

export interface PlaybackRefusal {
  reason: RefusalReason;
  detail?: string;
}

const REFUSAL_MESSAGES: Record<RefusalReason, string> = {
  "no-sources": "Jellyfin returned no media source for this item.",
  "no-direct-play": "Jellyfin cannot direct-play this item for Fluster.",
  "not-a-file": "This item is not a file on the server, so Fluster cannot play it directly.",
  "live-source": "This item is a live stream, which Fluster cannot play directly.",
  "server-requires-transcoding": "Jellyfin would need to convert this item. Server conversion is disabled.",
  "disc-source": "This item is a Blu-ray or DVD folder, which Fluster cannot play directly.",
  "iso-source": "This item is a disc image (ISO), which Fluster does not play yet.",
  "missing-source-data": "Jellyfin returned an incomplete media source for this item.",
};

export class PlaybackRefusedError extends Error {
  readonly reason: RefusalReason;
  readonly detail?: string;

  constructor(refusal: PlaybackRefusal) {
    super(REFUSAL_MESSAGES[refusal.reason]);
    this.name = "PlaybackRefusedError";
    this.reason = refusal.reason;
    this.detail = refusal.detail;
  }
}

export interface PlaybackStartChoice {
  kind: "resume" | "start-over";
  startPositionTicks: number;
}

export function startOverChoice(): PlaybackStartChoice {
  return { kind: "start-over", startPositionTicks: 0 };
}

export function resumeChoice(item: LibraryItem): PlaybackStartChoice | undefined {
  if (item.played || item.resumePositionTicks <= 0) return undefined;
  return { kind: "resume", startPositionTicks: item.resumePositionTicks };
}

export interface MediaTrack {
  index: number;
  type: "Audio" | "Subtitle" | "Video";
  displayTitle: string;
  // ffprobe codec name; Rust uses it to verify a track mapping.
  codec?: string;
  language?: string;
  external: boolean;
  deliveryUrl?: string;
}

export interface PlayerTrack {
  playerId: number;
  jellyfinIndex?: number;
  type: "Audio" | "Subtitle" | "Video";
  title: string;
  language?: string;
  external: boolean;
  selected: boolean;
}

export interface PlaybackPlan {
  itemId: string;
  title: string;
  // Token-free: media requests authenticate with `authorization` instead.
  streamUrl: string;
  // The signed-in `MediaBrowser …` header. Only the native engine sends it,
  // through the typed launch request; it must never be logged or put in a URL.
  authorization: string;
  mediaSourceId: string;
  playSessionId: string;
  startPositionTicks: number;
  tracks: MediaTrack[];
  // Jellyfin stream indices (not mpv track ids) the server chose for the
  // initial selection. An absent or -1 subtitle index means subtitles off.
  defaultAudioStreamIndex?: number;
  defaultSubtitleStreamIndex?: number;
}

export interface PlayerCapabilities {
  mode: "native" | "browser";
  embedded: boolean;
  renderer: string;
  nativeRenderer: string;
  libmpvVersion?: string;
}

export interface PlayerSurfaceFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  visible: boolean;
}

export interface PlaybackDiagnostics {
  decodeMode: "unknown" | "hardware" | "software";
  decodeLabel: string;
  hwdecCurrent?: string;
  hwdecInterop?: string;
  hwPixelFormat?: string;
  videoOutput?: string;
  gpuContext?: string;
  videoCodec?: string;
  bitDepth?: number;
  width?: number;
  height?: number;
  droppedFrames: number;
  warning?: string;
}

export interface PlaybackSnapshot {
  positionSeconds: number;
  durationSeconds?: number;
  paused: boolean;
  buffering: boolean;
  volume: number;
  muted: boolean;
  audioTrack?: number;
  subtitleTrack?: number;
  tracks: PlayerTrack[];
  diagnostics: PlaybackDiagnostics;
}

export type PlaybackEndReason = "eof" | "stopped" | "quit" | "error";

export type PlayerEvent =
  | { kind: "loaded"; snapshot: PlaybackSnapshot }
  | { kind: "first-frame" }
  | { kind: "state"; snapshot: PlaybackSnapshot; cause?: "pause" | "seek" | "property" }
  | { kind: "tracks-changed"; snapshot: PlaybackSnapshot }
  | { kind: "ended"; snapshot?: PlaybackSnapshot; reason: PlaybackEndReason }
  | { kind: "error"; message: string };

export interface PlayerEngine {
  readonly mode: "native" | "browser";
  initialize(): Promise<PlayerCapabilities>;
  subscribe(listener: (event: PlayerEvent) => void): Promise<() => void>;
  setSurface(frame: PlayerSurfaceFrame): Promise<void>;
  launch(plan: PlaybackPlan): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  selectTrack(type: "audio" | "subtitle", id?: number): Promise<void>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  stop(): Promise<void>;
}

export function ticksToSeconds(ticks: number | null | undefined): number {
  return Math.max(0, (ticks ?? 0) / TICKS_PER_SECOND);
}

export function secondsToTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds * TICKS_PER_SECOND));
}
