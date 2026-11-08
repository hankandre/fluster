// Skippable parts of a video, as the server's media segments describe them.
// Only intros and outros are offered; other segment types are never requested.
export type SkippableKind = "Intro" | "Outro";

export interface MediaSegment {
  kind: SkippableKind;
  startSeconds: number;
  endSeconds: number;
}

// The skip button disappears this long before the segment ends, so a click
// never seeks only a moment ahead.
export const SKIP_HIDE_BEFORE_END_SECONDS = 1;

// The segment the position is inside, or undefined when there is nothing to skip.
export function activeSegment(segments: MediaSegment[], positionSeconds: number): MediaSegment | undefined {
  return segments.find((segment) => (
    positionSeconds >= segment.startSeconds
    && positionSeconds < segment.endSeconds - SKIP_HIDE_BEFORE_END_SECONDS
  ));
}
