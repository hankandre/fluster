import { Check } from "lucide-react";
import { CardImage } from "./card-image";
import "./media.css";

export type MediaCardVariant = "poster" | "thumb" | "episode" | "library";

const COUNT_CAP = 99;

interface MediaFrameProps {
  variant: MediaCardVariant;
  title: string;
  image?: { src?: string; blurHash?: string };
  // Fraction watched, 0 to 1.
  progress?: number;
  played?: boolean;
  unplayedCount?: number;
}

// The art of a card with its played check, unwatched count, and progress bar (DESIGN.md 7.5). Marks are hidden
// from assistive technology because the owner's accessible name carries them.
export function MediaFrame({ variant, title, image, progress, played, unplayedCount }: MediaFrameProps) {
  const showCount = !played && unplayedCount !== undefined && unplayedCount > 0;
  return (
    <div className="media-card-frame" data-variant={variant}>
      <CardImage image={image} src={image?.src} fallbackTitle={title} />
      {played ? (
        <span className="media-card-mark" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
      ) : null}
      {showCount ? (
        <span className="media-card-mark" aria-hidden="true">{unplayedCount > COUNT_CAP ? `${COUNT_CAP}+` : unplayedCount}</span>
      ) : null}
      {progress !== undefined ? (
        <div className="media-card-progress" data-testid="card-progress" aria-hidden="true">
          <div style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}
