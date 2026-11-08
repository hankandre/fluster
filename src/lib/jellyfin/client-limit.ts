// Decides whether the user's own streaming limit is the only reason the
// server converts a source (decision 0002 policy 4), so "Play original" may be
// offered. It never offers when the server's policy could be the cause.
import type { ConversionReason } from "../../domain/playback";
import { MAX_BITRATE } from "./device-profile";
import type { MediaSourceDto } from "./types";

// The reasons the server gives when a bitrate is over the maximum it was told.
const BITRATE_REASONS: ReadonlySet<ConversionReason> = new Set([
  "ContainerBitrateExceedsLimit",
  "VideoBitrateNotSupported",
  "AudioBitrateNotSupported",
]);

// True when a limit was sent, every reason is a bitrate reason, and the file's
// bitrate is over the limit. A file at or under the limit that the server still
// converts is the server's own limit (for example RemoteClientBitrateLimit), so
// the original is not offered. An absent TranscodeReasons or an unknown
// reason says nothing about the cause and also is not offered.
export function limitIsOnlyReason(
  source: MediaSourceDto,
  reasons: readonly ConversionReason[],
  sentBitrate: number,
): boolean {
  if (sentBitrate >= MAX_BITRATE) return false;
  if (reasons.length === 0 || !reasons.every((reason) => BITRATE_REASONS.has(reason))) return false;
  return typeof source.Bitrate === "number" && source.Bitrate > sentBitrate;
}
