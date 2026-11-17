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

// What happens at a kind of segment: offer a Skip button, seek past it, or leave it alone.
export type SkipMode = "button" | "auto" | "none";

export const SKIP_MODES: readonly SkipMode[] = ["button", "auto", "none"];

export interface SkipModes {
  intro: SkipMode;
  credits: SkipMode;
}

export const DEFAULT_SKIP_MODES: SkipModes = Object.freeze({ intro: "button", credits: "button" });

// Splits segments by the viewer's modes. Credits are never offered while a
// next episode exists: Up Next takes their place in every mode (Q19 A).
export function offeredSegments(
  segments: MediaSegment[],
  modes: SkipModes,
  hasNext: boolean,
): { button: MediaSegment[]; auto: MediaSegment[] } {
  const button: MediaSegment[] = [];
  const auto: MediaSegment[] = [];
  for (const segment of segments) {
    if (segment.kind === "Outro" && hasNext) continue;
    const mode = segment.kind === "Intro" ? modes.intro : modes.credits;
    if (mode === "button") button.push(segment);
    if (mode === "auto") auto.push(segment);
  }
  return { button, auto };
}

export function segmentKey(segment: MediaSegment): string {
  return `${segment.kind}:${segment.startSeconds}:${segment.endSeconds}`;
}

// The segment to skip now: the one the position is inside, unless it was skipped already.
export function segmentToAutoSkip(
  segments: MediaSegment[],
  positionSeconds: number,
  done: ReadonlySet<string>,
): MediaSegment | undefined {
  return activeSegment(segments.filter((segment) => !done.has(segmentKey(segment))), positionSeconds);
}
