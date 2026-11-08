import type { MediaSegment } from "../../domain/media-segments";

const TICKS_PER_SECOND = 10_000_000;

// MediaSegmentDto from GET /MediaSegments/{itemId}.
export interface MediaSegmentDto {
  Id?: string;
  Type?: string;
  StartTicks?: number;
  EndTicks?: number;
}

export interface MediaSegmentsResponse {
  Items?: MediaSegmentDto[] | null;
}

// Keeps well-formed intros and outros, sorted by start. Anything else the
// server sends (other types, missing or empty ranges) is dropped.
export function toMediaSegments(response: MediaSegmentsResponse | undefined): MediaSegment[] {
  const segments: MediaSegment[] = [];
  for (const dto of response?.Items ?? []) {
    if (dto.Type !== "Intro" && dto.Type !== "Outro") continue;
    if (dto.StartTicks == null || dto.EndTicks == null) continue;
    if (!(dto.EndTicks > dto.StartTicks)) continue;
    segments.push({
      kind: dto.Type,
      startSeconds: dto.StartTicks / TICKS_PER_SECOND,
      endSeconds: dto.EndTicks / TICKS_PER_SECOND,
    });
  }
  return segments.sort((a, b) => a.startSeconds - b.startSeconds);
}
