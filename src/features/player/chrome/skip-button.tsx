import { SkipForward } from "lucide-react";
import type { MediaSegment } from "../../../domain/media-segments";

const LABELS = { Intro: "Skip intro", Outro: "Skip credits" } as const;

// Offers a skip while playback is inside an intro or outro. Pressing it seeks
// to the segment's end; an outro that runs to the end of the file therefore
// lets playback finish normally. It never takes focus by itself.
export function SkipButton({ segment, onSkip }: {
  segment: MediaSegment;
  onSkip(seconds: number): void;
}) {
  return (
    <button type="button" className="skip-button" onClick={() => onSkip(segment.endSeconds)}>
      <SkipForward aria-hidden="true" />
      {LABELS[segment.kind]}
    </button>
  );
}
