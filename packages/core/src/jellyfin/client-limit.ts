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
// bitrate is over the limit. The server's reasons do not say whose limit it
// was, so a server-side cap (for example RemoteClientBitrateLimit) that is
// lower than the user's limit also passes this check. Play original then
// renegotiates once and the player says "The server still converts this."
// Files at or under the limit, an absent TranscodeReasons, and any other
// reason are not offered.
export function limitIsOnlyReason(
  source: MediaSourceDto,
  reasons: readonly ConversionReason[],
  sentBitrate: number,
): boolean {
  if (sentBitrate >= MAX_BITRATE) return false;
  if (reasons.length === 0 || !reasons.every((reason) => BITRATE_REASONS.has(reason))) return false;
  return typeof source.Bitrate === "number" && source.Bitrate > sentBitrate;
}
