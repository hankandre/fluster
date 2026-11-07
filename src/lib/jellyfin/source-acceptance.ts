// Decides whether a media source from a PlaybackInfo response may be played
// as a static original file (ARCHITECTURE.md §3, invariants I1 and I2).
// Rules run in order and the first one that fails decides the reason.
import type { RefusalReason } from "../../domain/playback";
import type { MediaSourceDto } from "./types";

export interface AcceptedSource extends MediaSourceDto {
  Id: string;
  Path: string;
}

export type SourceDecision =
  | { kind: "accepted"; source: AcceptedSource }
  | { kind: "refused"; reason: RefusalReason; detail?: string };

// A Static=true request for a disc folder makes the server start ffmpeg.
const DISC_VIDEO_TYPES = new Set(["BluRay", "Dvd"]);

export function evaluateSource(source: MediaSourceDto): SourceDecision {
  // Disc checks come first so a disc folder always gets the clearest reason.
  if (source.VideoType && DISC_VIDEO_TYPES.has(source.VideoType)) {
    return refused({ reason: "disc-source", detail: source.VideoType });
  }
  // Rejected until mpv playback of an ISO over HTTP is verified.
  if (source.VideoType === "Iso") {
    return refused({ reason: "iso-source" });
  }
  if (source.SupportsDirectPlay !== true) {
    return refused({ reason: "no-direct-play" });
  }
  if (source.Protocol !== "File") {
    return refused({ reason: "not-a-file", detail: source.Protocol ?? "missing protocol" });
  }
  if (source.TranscodingUrl) {
    return refused({ reason: "server-requires-transcoding" });
  }
  if (!source.Id || !source.Path) {
    return refused({ reason: "missing-source-data", detail: source.Id ? "Path" : "Id" });
  }
  return { kind: "accepted", source: { ...source, Id: source.Id, Path: source.Path } };
}

// Picks the requested version, or the first acceptable source. When nothing
// is accepted, the refusal of the first candidate explains why.
export function selectSource(sources: MediaSourceDto[] | null | undefined, mediaSourceId?: string): SourceDecision {
  const candidates = mediaSourceId
    ? (sources ?? []).filter((source) => source.Id === mediaSourceId)
    : (sources ?? []);
  if (candidates.length === 0) {
    return refused({ reason: "no-sources", detail: mediaSourceId ? "requested version not returned" : undefined });
  }
  const decisions = candidates.map(evaluateSource);
  const accepted = decisions.find((decision) => decision.kind === "accepted");
  return accepted ?? decisions[0];
}

function refused(refusal: { reason: RefusalReason; detail?: string }): SourceDecision {
  return { kind: "refused", ...refusal };
}
