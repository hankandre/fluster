// The PlayerEngine port (T2-05): the one seam between Octave and a device's player. Every engine implements it,
// and the native player module mirrors it one to one. This file imports nothing, so it names no engine.

// The opaque transport session id (decision 0005). It names a native session registry entry and is not secret.
export type SessionRef = string;

export interface MediaTrack {
  index: number;
  type: "Audio" | "Subtitle" | "Video";
  displayTitle: string;
  // ffprobe codec name; an engine uses it to verify a track mapping.
  codec?: string;
  language?: string;
  external: boolean;
  deliveryUrl?: string;
  // The stream's own title, as the file's author set it.
  title?: string;
  // Audio channel count.
  channels?: number;
  // Absent means false or unknown for the three flags below.
  isDefault?: boolean;
  isForced?: boolean;
  isHearingImpaired?: boolean;
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

interface LaunchCommon {
  sessionId: SessionRef;
  startPositionSeconds: number;
  // The plan's Jellyfin streams. The engine maps its own track ids to these indices.
  tracks: readonly MediaTrack[];
  // Jellyfin stream indices for the first selection. A subtitle index of -1, or none, means off.
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
}

// What the engine plays: the original file, or a server conversion's rebuilt master playlist. Every URL is
// token-free; the engine's native client adds the header for `sessionId`. The engine re-checks an HLS master URL
// against `serverUrl` (the signed-in server, with any base path) and `mediaKind`.
export type LaunchRequest =
  | (LaunchCommon & { kind: "original"; url: string })
  | (LaunchCommon & { kind: "hls"; masterUrl: string; serverUrl: string; mediaKind: HlsMediaKind });

// Jellyfin MediaStream.Codec spellings. A starting set: adding a value is a type change, not a new command.
export const VIDEO_CODECS = ["h264", "hevc", "av1", "vp9", "vp8", "mpeg2video", "mpeg4", "vc1"] as const;
export const AUDIO_CODECS = [
  "aac",
  "mp3",
  "ac3",
  "eac3",
  "truehd",
  "dts",
  "flac",
  "alac",
  "opus",
  "vorbis",
  "pcm_s16le",
  "pcm_s24le",
] as const;
export const HDR_TYPES = ["hdr10", "hdr10-plus", "hlg", "dolby-vision"] as const;
export const PASSTHROUGH_FORMATS = ["ac3", "eac3", "eac3-joc", "dts", "dts-hd", "truehd"] as const;

export type VideoCodec = (typeof VIDEO_CODECS)[number];
export type AudioCodec = (typeof AUDIO_CODECS)[number];
export type HdrType = (typeof HDR_TYPES)[number];
export type PassthroughFormat = (typeof PASSTHROUGH_FORMATS)[number];

export interface VideoDecoder {
  codec: VideoCodec;
  hardware: boolean;
  // Jellyfin's MediaStream.Profile spelling (for example "Main 10"); absent means any profile. Matching is exact,
  // not by hierarchy: a probe lists one VideoDecoder entry for every profile the decoder supports (a High decoder
  // also lists "Main" and "Constrained Baseline"), or omits the profile when it decodes any.
  profile?: string;
  maxBitDepth?: 8 | 10 | 12;
  maxWidth?: number;
  maxHeight?: number;
}

// What the device can play, as the engine probed it.
export type PlayerCapabilities =
  | {
    probe: "complete";
    videoDecoders: readonly VideoDecoder[];
    audioDecoders: readonly AudioCodec[];
    hdr: readonly HdrType[];
    passthrough: readonly PassthroughFormat[];
  }
  // The engine could not read the device: "cannot tell", never "can play".
  | { probe: "failed" };

export const PLAYER_ERROR_CODES = [
  // The stream could not be fetched: no connection, a timeout, a dropped connection.
  "network",
  // The server answered an error status, or a redirect the client refused.
  "server-error",
  // The launch named a session the native registry does not hold, or the server ended it.
  "session-ended",
  // An HLS playlist failed native validation (I2).
  "unsafe-playlist",
  // The engine refused the request's kind or shape.
  "unsupported-request",
  // The container or a playlist could not be parsed.
  "malformed-media",
  // No decoder on this device for the stream's format.
  "decoder-unavailable",
  // A decoder failed to start or failed while decoding.
  "decoder-failed",
  // The audio output could not be opened.
  "audio-output-failed",
  // The engine did not finish shutting down (the coordinator raises it).
  "stop-failed",
  "unknown",
] as const;
export type PlayerErrorCode = (typeof PLAYER_ERROR_CODES)[number];

// One fixed sentence per code. Player text never reaches a viewer.
export const PLAYER_ERROR_MESSAGES: Record<PlayerErrorCode, string> = {
  "network": "The stream could not be reached. Check the connection and try again.",
  "server-error": "The server could not send this stream.",
  "session-ended": "The server session has ended. Sign in again to keep watching.",
  "unsafe-playlist": "The server sent a stream Octave will not play.",
  "unsupported-request": "The player cannot play this kind of stream.",
  "malformed-media": "This file could not be read.",
  "decoder-unavailable": "This device cannot decode this video or audio format.",
  "decoder-failed": "The video or audio decoder stopped working.",
  "audio-output-failed": "The sound could not be played on this device.",
  "stop-failed": "The player did not finish shutting down.",
  "unknown": "Something went wrong.",
};

// Reads a code from an untrusted value; anything outside the list is "unknown".
export function playerErrorCode(value: unknown): PlayerErrorCode {
  return (PLAYER_ERROR_CODES as readonly unknown[]).includes(value) ? (value as PlayerErrorCode) : "unknown";
}

// An engine's typed failure. The message is the fixed copy for the code, never player text.
export class PlayerEngineError extends Error {
  readonly code: PlayerErrorCode;

  constructor(code: PlayerErrorCode) {
    super(PLAYER_ERROR_MESSAGES[code]);
    this.name = "PlayerEngineError";
    this.code = code;
  }
}

export interface PlaybackDiagnostics {
  decodeMode: "unknown" | "hardware" | "software";
  decodeLabel: string;
  videoCodec?: string;
  bitDepth?: number;
  width?: number;
  height?: number;
  droppedFrames: number;
}

// What the engine reports for the picture. "dolby-vision" is the track's
// signalling, not proof that the enhancement layer was rendered.
export type VideoRange = "unknown" | "sdr" | "pq" | "hlg" | "dolby-vision";

export interface VideoFacts {
  codec?: string;
  range: VideoRange;
  dolbyVisionProfile?: number;
}

export interface AudioFacts {
  codec?: string;
  channelCount?: number;
  sampleRate?: number;
  outputChannelCount?: number;
  // Decoded to PCM on the device, or sent as the encoded stream to the receiver.
  output?: "pcm" | "passthrough";
  passthroughFormat?: PassthroughFormat;
}

export interface PlaybackSnapshot {
  positionSeconds: number;
  durationSeconds?: number;
  paused: boolean;
  buffering: boolean;
  // Sent in playstate reports. An engine with no app-level volume reports 100 and false.
  volume: number;
  muted: boolean;
  audioTrack?: number;
  subtitleTrack?: number;
  tracks: PlayerTrack[];
  diagnostics: PlaybackDiagnostics;
  video?: VideoFacts;
  audio?: AudioFacts;
  // The last buffered timestamp, on the playback timeline.
  bufferedSeconds?: number;
}

export type PlaybackEndReason = "eof" | "stopped" | "error";

export const PLAYER_EVENT_KINDS = ["loaded", "first-frame", "state", "tracks-changed", "ended", "error"] as const;

export type PlayerEvent =
  | { kind: "loaded"; snapshot: PlaybackSnapshot }
  | { kind: "first-frame" }
  | { kind: "state"; snapshot: PlaybackSnapshot; cause?: "pause" | "seek" | "property" }
  | { kind: "tracks-changed"; snapshot: PlaybackSnapshot }
  | { kind: "ended"; snapshot?: PlaybackSnapshot; reason: PlaybackEndReason }
  | { kind: "error"; code: PlayerErrorCode };

// Six commands and one event subscription. Adding one changes this list, the allowlist test and docs/security.md.
export const PLAYER_ENGINE_METHODS = ["initialize", "subscribe", "launch", "setPaused", "seek", "selectTrack", "stop"] as const;

export interface PlayerEngine {
  initialize(): Promise<PlayerCapabilities>;
  subscribe(listener: (event: PlayerEvent) => void): Promise<() => void>;
  launch(request: LaunchRequest): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  selectTrack(type: "audio" | "subtitle", playerId?: number): Promise<void>;
  stop(): Promise<void>;
}

// Compile-time belts: `pnpm typecheck` fails when the port's members or event kinds drift from the lists above.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const PORT_MEMBERS_MATCH_LIST: Same<keyof PlayerEngine, (typeof PLAYER_ENGINE_METHODS)[number]> = true;
export const EVENT_KINDS_MATCH_LIST: Same<PlayerEvent["kind"], (typeof PLAYER_EVENT_KINDS)[number]> = true;
