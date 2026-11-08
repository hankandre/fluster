import type { LibraryItem } from "./catalog";

export const TICKS_PER_SECOND = 10_000_000;

// Decision 0002: the original file first, then a server remux (DirectStream),
// then a transcode, always shown with its reason.
export const PLAYBACK_POLICY = Object.freeze({
  allowServerTranscoding: true,
  allowServerRemux: true,
  preferHardwareDecode: true,
  allowSoftwareDecode: true,
});

// Why Fluster refused every media source a PlaybackInfo response offered.
// Each value maps to one source decision rule in ARCHITECTURE.md §3.
// `disc-source` and `iso-source` remain only for a disc the server still offers for direct play
// after the forced-fallback request.
export type RefusalReason =
  | "no-sources"
  | "not-a-file"
  | "live-source"
  | "disc-source"
  | "iso-source"
  | "missing-source-data"
  | "conversion-not-allowed"
  | "unsafe-transcoding-url";

// How the media reaches the player (decision 0002). DirectPlay is the
// original file; DirectStream is a server remux that copies video and audio;
// Transcode is anything the server may re-encode.
export type PlayMethod = "DirectPlay" | "DirectStream" | "Transcode";

// Jellyfin's TranscodeReason names (MediaBrowser.Model/Session/TranscodeReason.cs,
// 10.11.7 and 12.4.0). The server sends them only inside TranscodingUrl.
export const CONVERSION_REASONS = [
  "ContainerNotSupported",
  "VideoCodecNotSupported",
  "AudioCodecNotSupported",
  "SubtitleCodecNotSupported",
  "AudioIsExternal",
  "SecondaryAudioNotSupported",
  "StreamCountExceedsLimit",
  "VideoProfileNotSupported",
  "VideoRangeTypeNotSupported",
  "VideoCodecTagNotSupported",
  "VideoLevelNotSupported",
  "VideoResolutionNotSupported",
  "VideoBitDepthNotSupported",
  "VideoFramerateNotSupported",
  "VideoRotationNotSupported",
  "RefFramesNotSupported",
  "AnamorphicVideoNotSupported",
  "InterlacedVideoNotSupported",
  "AudioChannelsNotSupported",
  "AudioProfileNotSupported",
  "AudioSampleRateNotSupported",
  "AudioBitDepthNotSupported",
  "ContainerBitrateExceedsLimit",
  "VideoBitrateNotSupported",
  "AudioBitrateNotSupported",
  "UnknownVideoStreamInfo",
  "UnknownAudioStreamInfo",
  "DirectPlayError",
] as const;

export type ConversionReason = (typeof CONVERSION_REASONS)[number];

export interface PlaybackRefusal {
  reason: RefusalReason;
  detail?: string;
}

const REFUSAL_MESSAGES: Record<RefusalReason, string> = {
  "no-sources": "Jellyfin returned no media source for this item.",
  "not-a-file": "This item is not a file on the server, so Fluster cannot play it directly.",
  "live-source": "This item is a live stream, which Fluster cannot play directly.",
  "disc-source": "This item is a Blu-ray or DVD folder, which Fluster cannot play directly.",
  "iso-source": "This item is a disc image (ISO), which Fluster does not play yet.",
  "missing-source-data": "Jellyfin returned an incomplete media source for this item.",
  "conversion-not-allowed": "This item needs converting, and the server does not allow that for this account.",
  "unsafe-transcoding-url": "Jellyfin offered a stream address Fluster will not use.",
};

// An engine was handed a plan whose delivery it cannot play. It refuses
// before any player call; it never falls back to another engine (I7).
export class UnsupportedDeliveryError extends Error {
  readonly delivery: PlaybackPlan["delivery"];
  readonly engine: "native" | "browser";

  constructor(engine: "native" | "browser", delivery: PlaybackPlan["delivery"], message: string) {
    super(message);
    this.name = "UnsupportedDeliveryError";
    this.engine = engine;
    this.delivery = delivery;
  }
}

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

// `videos` for a source with video (or a VideoType), `audio` for an
// audio-only source: the master playlist path Jellyfin uses.
export type HlsMediaKind = "videos" | "audio";

// A static plan plays the original file; an hls plan plays a server
// conversion whose master playlist URL Playback Negotiation rebuilt. Rust
// re-checks the master URL against `serverUrl` (the signed-in server, with
// any base path) and `mediaKind`, and refuses it otherwise.
export type PlaybackDelivery =
  | { delivery: "static"; playMethod: "DirectPlay"; conversionReasons: readonly [] }
  | {
    delivery: "hls";
    playMethod: "DirectStream" | "Transcode";
    conversionReasons: readonly ConversionReason[];
    serverUrl: string;
    mediaKind: HlsMediaKind;
  };

export type PlaybackPlan = PlaybackPlanBase & PlaybackDelivery;

export interface PlaybackPlanBase {
  itemId: string;
  title: string;
  // Token-free: media requests authenticate with `authorization` instead.
  // Static delivery: the `Static=true` original-file URL. HLS delivery: the
  // rebuilt same-origin `master.m3u8` URL (ARCHITECTURE.md §3 HLS URL rules).
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
  // The chosen version's MediaSourceInfo.HasSegments. Absent means false.
  hasSegments?: boolean;
  // True when the user's streaming limit is the only reason for the
  // conversion, so Play original may renegotiate without it. Absent means false.
  playOriginalAvailable?: boolean;
  // True when the conversion burns subtitles into the picture
  // (`SubtitleMethod=Encode` in the rebuilt master URL). Absent means false.
  subtitlesBurnedIn?: boolean;
}

// Per-negotiation choices that are not part of the item.
export interface PlaybackPlanOptions {
  // Negotiate without the user's streaming limit. Used by Play original for
  // one session; never stored.
  ignoreStreamingLimit?: boolean;
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
