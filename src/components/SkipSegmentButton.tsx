import { SkipForward } from "lucide-react";
import { activeSegment, type MediaSegment } from "../domain/media-segments";

const LABELS = { Intro: "Skip intro", Outro: "Skip credits" } as const;

// Offers a skip while playback is inside an intro or outro. Clicking seeks to
// the segment's end; an outro that runs to the end of the file therefore lets
// playback finish normally. It never takes focus by itself.
export function SkipSegmentButton({ segments, positionSeconds, onSeek }: {
  segments: MediaSegment[];
  positionSeconds: number;
  onSeek(seconds: number): void;
}) {
  const segment = activeSegment(segments, positionSeconds);
  if (!segment) return null;
  return (
    <button type="button" className="skip-segment-button" onClick={() => onSeek(segment.endSeconds)}>
      <SkipForward size={18} aria-hidden="true" />
      {LABELS[segment.kind]}
    </button>
  );
}
