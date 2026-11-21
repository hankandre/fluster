import type { LibraryItem } from "./catalog";
import type { HlsMediaKind, MediaTrack } from "./player-engine";

// The PlayerEngine port and the types it reaches live in player-engine.ts (T2-05).
export * from "./player-engine";

export const TICKS_PER_SECOND = 10_000_000;

// Decision 0002: the original file first, then a server remux (DirectStream),
// then a transcode, always shown with its reason.
export const PLAYBACK_POLICY = Object.freeze({
  allowServerTranscoding: true,
  allowServerRemux: true,
  preferHardwareDecode: true,
  allowSoftwareDecode: true,
});

// Why Octave refused every media source a PlaybackInfo response offered.
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
  "not-a-file": "This item is not a file on the server, so Octave cannot play it directly.",
  "live-source": "This item is a live stream, which Octave cannot play directly.",
  "disc-source": "This item is a Blu-ray or DVD folder, which Octave cannot play directly.",
  "iso-source": "This item is a disc image (ISO), which Octave does not play yet.",
  "missing-source-data": "Jellyfin returned an incomplete media source for this item.",
  "conversion-not-allowed": "This item needs converting, and the server does not allow that for this account.",
  "unsafe-transcoding-url": "Jellyfin offered a stream address Octave will not use.",
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

// A static plan plays the original file; an hls plan plays a server
// conversion whose master playlist URL Playback Negotiation rebuilt. Native
// code re-checks the master URL against `serverUrl` (the signed-in server,
// with any base path) and `mediaKind`, and refuses it otherwise.
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

// What the server's own session reports for a running conversion
// (GET /Sessions: PlayState.PlayMethod and TranscodingInfo). `videoDirect`
// and `audioDirect` are true when the server copies that stream.
export interface ServerPlayMethod {
  playMethod?: PlayMethod;
  videoDirect: boolean;
  audioDirect: boolean;
  reasons: readonly ConversionReason[];
}

export interface PlaybackPlanBase {
  itemId: string;
  title: string;
  // Token-free: the plan never carries the signed-in header. The engine's
  // native client adds the header for the session id; the launch request carries none.
  // Static delivery: the `Static=true` original-file URL. HLS delivery: the
  // rebuilt same-origin `master.m3u8` URL (ARCHITECTURE.md §3 HLS URL rules).
  streamUrl: string;
  mediaSourceId: string;
  playSessionId: string;
  startPositionTicks: number;
  tracks: MediaTrack[];
  // Jellyfin stream indices (not the engine's track ids) the server chose for the
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
  // The chosen version's MediaSourceInfo.Bitrate in bits per second, when the
  // server knows it. A streaming limit below it changes the delivery.
  sourceBitrate?: number;
}

// Asks Jellyfin for no subtitle stream (`SubtitleStreamIndex=-1`).
export const SUBTITLES_OFF = -1;

// The Jellyfin audio and subtitle streams a renegotiation asks for. An
// absent field leaves the choice to the server; a subtitle of SUBTITLES_OFF
// asks for none.
export interface StreamSelection {
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
}

// Per-negotiation choices that are not part of the item.
export interface PlaybackPlanOptions extends StreamSelection {
  // Negotiate without the user's streaming limit. Used by Play original for
  // one session; never stored.
  ignoreStreamingLimit?: boolean;
  // Set for a session that started from a viewer's audio pick. An answer that names the audio index is
  // used only if it direct plays, or if the same request without the index does not (I1). Never sent.
  keepDirectPlay?: boolean;
}

export function ticksToSeconds(ticks: number | null | undefined): number {
  return Math.max(0, (ticks ?? 0) / TICKS_PER_SECOND);
}

export function secondsToTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds * TICKS_PER_SECOND));
}
