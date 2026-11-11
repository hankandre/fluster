import { Info } from "lucide-react";
import { useId, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRovingFocus } from "../../roving-focus";
import { artTint } from "../art-tint";
import { timeLeftLabel } from "../time-left";
import { ButtonLink } from "./button";
import { cardAccessibleName } from "./media-card";
import { MediaFrame } from "./media-frame";
import "./episode-row.css";

export interface EpisodeRowProps {
  title: string;
  // The episode number, shown before the title.
  number?: number;
  // Kept for the accessible name, such as "Episode 1".
  subtitle?: string;
  // The runtime as text, such as "45 min"; shown when there is no time left to show.
  runtime?: string;
  remainingTicks?: number;
  // Fraction watched, 0 to 1.
  progress?: number;
  played?: boolean;
  overview?: string;
  // `src` is already built by the gateway.
  image?: { src?: string; blurHash?: string };
  // The play route. A click calls onActivate in place of following it.
  href: string;
  onActivate?(event: MouseEvent<HTMLAnchorElement>): void;
  detailsHref: string;
}

// The episodes of one season: one Tab stop, a two-column grid of play and Details links (DESIGN.md 7.6).
export function EpisodeList({ label, children }: { label: string; children: ReactNode }) {
  const roving = useRovingFocus<HTMLUListElement>("grid", { spatial: true, columns: 2 });
  return (
    <ul className="episode-list" aria-label={label} data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
      {children}
    </ul>
  );
}

// One episode: the art, number and title, runtime or time left, and a two-line overview. The whole row plays;
// a trailing icon link opens the details, as `i` does.
export function EpisodeRow(props: EpisodeRowProps) {
  const { title, number, runtime, remainingTicks, progress, played, overview, image, href, onActivate, detailsHref } = props;
  const ids = useId();
  const metaId = `${ids}-meta`;
  const overviewId = `${ids}-overview`;
  const timeLeft = progress !== undefined && remainingTicks !== undefined ? timeLeftLabel(remainingTicks) : undefined;
  const meta = timeLeft ?? runtime;
  const describedBy = [meta ? metaId : undefined, overview ? overviewId : undefined].filter(Boolean).join(" ");
  const style = { "--art-accent": artTint(image?.blurHash).accent } as CSSProperties;

  function openDetails(event: { preventDefault(): void }) {
    event.preventDefault();
    window.location.hash = detailsHref;
  }

  return (
    <li className="ui-episode-row">
      <a
        className="ui-episode-row-link"
        href={href}
        onClick={onActivate}
        data-roving-item=""
        data-media-card=""
        data-variant="episode"
        aria-label={cardAccessibleName(props)}
        aria-describedby={describedBy || undefined}
        aria-keyshortcuts="i"
        style={style}
        onKeyDown={(event: KeyboardEvent<HTMLAnchorElement>) => {
          const isInfo = event.key === "i" && !event.ctrlKey && !event.metaKey && !event.altKey;
          if (isInfo || event.key === "ContextMenu") openDetails(event);
        }}
        onContextMenu={openDetails}
      >
        <MediaFrame variant="episode" title={title} image={image} progress={progress} played={played} />
        <div className="episode-text" aria-hidden="true">
          <p className="ui-episode-row-title">{number !== undefined ? `${number} · ${title}` : title}</p>
          {meta ? <p id={metaId} className="ui-episode-row-meta">{meta}</p> : null}
          {overview ? <p id={overviewId} className="ui-episode-row-overview">{overview}</p> : null}
        </div>
      </a>
      <ButtonLink variant="icon" href={detailsHref} aria-label={`Details for ${title}`} data-roving-item="">
        <Info aria-hidden="true" size={20} />
      </ButtonLink>
    </li>
  );
}
