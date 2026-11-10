import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { artTint } from "../art-tint";
import { timeLeftLabel, timeLeftSpoken } from "../time-left";
import { CardImage } from "./card-image";
import "./media.css";

export type MediaCardVariant = "poster" | "thumb" | "episode" | "library";

export interface MediaCardProps {
  variant: MediaCardVariant;
  title: string;
  // Poster: the year. Thumb: the subtitle. Library: none.
  subtitle?: string;
  // A link when present, otherwise an article.
  href?: string;
  // `src` is already built by the gateway. A BlurHash alone shows the placeholder.
  image?: { src?: string; blurHash?: string };
  // Ticks left to watch, shown with `progress`.
  remainingTicks?: number;
  // Fraction watched, 0 to 1.
  progress?: number;
  played?: boolean;
  unplayedCount?: number;
}

const COUNT_CAP = 99;

function accessibleName(props: MediaCardProps): string {
  const { title, subtitle, progress, remainingTicks, played, unplayedCount } = props;
  const parts = [title, subtitle];
  if (progress !== undefined && remainingTicks !== undefined) parts.push(timeLeftSpoken(remainingTicks));
  if (played) parts.push("watched");
  if (unplayedCount !== undefined && unplayedCount > 0) {
    parts.push(`${unplayedCount} unwatched ${unplayedCount === 1 ? "episode" : "episodes"}`);
  }
  return parts.filter(Boolean).join(", ");
}

// A presentational card (DESIGN.md 7.5). Its visible text, marks, and progress are hidden from assistive
// technology because the accessible name carries them all.
export function MediaCard(props: MediaCardProps) {
  const { variant, title, subtitle, href, image, remainingTicks, progress, played, unplayedCount } = props;
  const label = accessibleName(props);
  const style = { "--art-accent": artTint(image?.blurHash).accent } as CSSProperties;
  const showCount = !played && unplayedCount !== undefined && unplayedCount > 0;
  const timeLeft = progress !== undefined && remainingTicks !== undefined ? timeLeftLabel(remainingTicks) : undefined;

  const body = (
    <>
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
      {variant !== "episode" ? (
        <div className="media-card-text" aria-hidden="true">
          <span className="media-card-title">{title}</span>
          {subtitle || timeLeft ? (
            <span className="media-card-meta">
              {subtitle ? <span className="media-card-subtitle">{subtitle}</span> : null}
              {timeLeft ? <span className="media-card-time">{timeLeft}</span> : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const common = { className: "media-card", "data-media-card": "", "data-variant": variant, "aria-label": label, style };
  if (href) return <a {...common} href={href} data-roving-item="">{body}</a>;
  return <article {...common}>{body}</article>;
}
