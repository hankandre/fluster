import type {
  AudioFacts,
  PlaybackDiagnostics,
  PlaybackEndReason,
  PlaybackSnapshot,
  PlayerEvent,
  PlayerTrack,
  VideoFacts,
  VideoRange,
} from "../domain/player-engine";
import { PASSTHROUGH_FORMATS, playerErrorCode } from "../domain/player-engine";

// Rebuilds an engine event from its known fields only (T2-05, D14). A kind outside
// PLAYER_EVENT_KINDS, or a snapshot event without a usable snapshot, gives undefined.
// Any other field, at any depth, is dropped, so player text cannot ride through.
export function playerEvent(value: unknown): PlayerEvent | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  switch (kind) {
    case "loaded":
    case "tracks-changed": {
      const snapshot = playbackSnapshot(value.snapshot);
      return snapshot ? { kind, snapshot } : undefined;
    }
    case "state": {
      const snapshot = playbackSnapshot(value.snapshot);
      if (!snapshot) return undefined;
      const cause = value.cause;
      return cause === "pause" || cause === "seek" || cause === "property" ? { kind, snapshot, cause } : { kind, snapshot };
    }
    case "first-frame":
      return { kind };
    case "ended": {
      const snapshot = playbackSnapshot(value.snapshot);
      const reason = endReason(value.reason);
      return snapshot ? { kind, snapshot, reason } : { kind, reason };
    }
    case "error":
      return { kind, code: playerErrorCode(value.code) };
    default:
      return undefined;
  }
}

// An unreadable end reason still ends the session, as a failed one.
function endReason(value: unknown): PlaybackEndReason {
  return value === "eof" || value === "stopped" || value === "error" ? value : "error";
}

export function playbackSnapshot(value: unknown): PlaybackSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const diagnostics = playbackDiagnostics(value.diagnostics);
  if (
    !isNumber(value.positionSeconds)
    || typeof value.paused !== "boolean"
    || typeof value.buffering !== "boolean"
    || !isNumber(value.volume)
    || typeof value.muted !== "boolean"
    || !Array.isArray(value.tracks)
    || !diagnostics
  ) {
    return undefined;
  }
  const snapshot: PlaybackSnapshot = {
    positionSeconds: value.positionSeconds,
    paused: value.paused,
    buffering: value.buffering,
    volume: value.volume,
    muted: value.muted,
    tracks: value.tracks.flatMap((track) => {
      const copy = playerTrack(track);
      return copy ? [copy] : [];
    }),
    diagnostics,
  };
  if (isNumber(value.durationSeconds)) snapshot.durationSeconds = value.durationSeconds;
  if (isNumber(value.audioTrack)) snapshot.audioTrack = value.audioTrack;
  if (isNumber(value.subtitleTrack)) snapshot.subtitleTrack = value.subtitleTrack;
  const video = videoFacts(value.video);
  if (video) snapshot.video = video;
  const audio = audioFacts(value.audio);
  if (audio) snapshot.audio = audio;
  if (isNumber(value.bufferedSeconds)) snapshot.bufferedSeconds = value.bufferedSeconds;
  return snapshot;
}

function playerTrack(value: unknown): PlayerTrack | undefined {
  if (!isRecord(value)) return undefined;
  const type = value.type;
  if (
    !isNumber(value.playerId)
    || (type !== "Audio" && type !== "Subtitle" && type !== "Video")
    || typeof value.title !== "string"
    || typeof value.external !== "boolean"
    || typeof value.selected !== "boolean"
  ) {
    return undefined;
  }
  const track: PlayerTrack = { playerId: value.playerId, type, title: value.title, external: value.external, selected: value.selected };
  if (isNumber(value.jellyfinIndex)) track.jellyfinIndex = value.jellyfinIndex;
  if (typeof value.language === "string") track.language = value.language;
  return track;
}

function playbackDiagnostics(value: unknown): PlaybackDiagnostics | undefined {
  if (!isRecord(value)) return undefined;
  const decodeMode = value.decodeMode;
  if (
    (decodeMode !== "unknown" && decodeMode !== "hardware" && decodeMode !== "software")
    || typeof value.decodeLabel !== "string"
    || !isNumber(value.droppedFrames)
  ) {
    return undefined;
  }
  const diagnostics: PlaybackDiagnostics = { decodeMode, decodeLabel: value.decodeLabel, droppedFrames: value.droppedFrames };
  if (typeof value.videoCodec === "string") diagnostics.videoCodec = value.videoCodec;
  if (isNumber(value.bitDepth)) diagnostics.bitDepth = value.bitDepth;
  if (isNumber(value.width)) diagnostics.width = value.width;
  if (isNumber(value.height)) diagnostics.height = value.height;
  return diagnostics;
}

const VIDEO_RANGES: readonly VideoRange[] = ["unknown", "sdr", "pq", "hlg", "dolby-vision"];

function videoFacts(value: unknown): VideoFacts | undefined {
  if (!isRecord(value) || !(VIDEO_RANGES as readonly unknown[]).includes(value.range)) return undefined;
  const facts: VideoFacts = { range: value.range as VideoRange };
  if (typeof value.codec === "string") facts.codec = value.codec;
  if (isNumber(value.dolbyVisionProfile)) facts.dolbyVisionProfile = value.dolbyVisionProfile;
  return facts;
}

function audioFacts(value: unknown): AudioFacts | undefined {
  if (!isRecord(value)) return undefined;
  const facts: AudioFacts = {};
  if (typeof value.codec === "string") facts.codec = value.codec;
  if (isNumber(value.channelCount)) facts.channelCount = value.channelCount;
  if (isNumber(value.sampleRate)) facts.sampleRate = value.sampleRate;
  if (isNumber(value.outputChannelCount)) facts.outputChannelCount = value.outputChannelCount;
  if (value.output === "pcm" || value.output === "passthrough") facts.output = value.output;
  if ((PASSTHROUGH_FORMATS as readonly unknown[]).includes(value.passthroughFormat)) {
    facts.passthroughFormat = value.passthroughFormat as AudioFacts["passthroughFormat"];
  }
  return facts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}
