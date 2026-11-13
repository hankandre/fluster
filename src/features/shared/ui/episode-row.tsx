import { Info } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRovingFocus } from "../../roving-focus";
import { artTint } from "../art-tint";
import { useTvForm } from "../use-tv-form";
import { timeLeftLabel } from "../time-left";
import { ButtonLink } from "./button";
import { useHoldOk } from "./use-hold-ok";
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

// The overview of the episode card that has focus, read from the card's own text.
function overviewOf(link: Element | null | undefined): string {
  return link?.querySelector(".ui-episode-row-overview")?.textContent ?? "";
}

// The episodes of one season: one Tab stop, a two-column grid of play and Details links (DESIGN.md 7.6).
// In the TV form it is a horizontal row of cards with one overview under it that follows focus.
export function EpisodeList({ label, children }: { label: string; children: ReactNode }) {
  const tv = useTvForm();
  const roving = useRovingFocus<HTMLUListElement>(tv ? "row" : "grid", tv ? { spatial: true } : { spatial: true, columns: 2 });
  const [overview, setOverview] = useState("");

  // Starts with the Tab stop's card, then follows focus.
  useEffect(() => {
    if (!tv) return;
    setOverview(overviewOf(roving.ref.current?.querySelector('[data-roving-item][tabindex="0"]')));
  }, [tv, children, roving.ref]);

  function onFocus(event: FocusEvent<HTMLUListElement>) {
    roving.onFocus(event);
    if (tv) setOverview(overviewOf((event.target as HTMLElement).closest("[data-roving-item]")));
  }

  return (
    <>
      <ul className="episode-list" aria-label={label} data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={onFocus}>
        {children}
      </ul>
      {tv ? <p className="episode-row-overview" aria-hidden="true">{overview}</p> : null}
    </>
  );
}

// One episode: the art, number and title, runtime or time left, and a two-line overview. The whole row plays;
// a trailing icon link opens the details, as `i` does.
export function EpisodeRow(props: EpisodeRowProps) {
  const { title, number, runtime, remainingTicks, progress, played, overview, image, href, onActivate, detailsHref } = props;
  const tv = useTvForm();
  const hold = useHoldOk(detailsHref);
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
    <li className="ui-episode-row" data-tv={tv ? "true" : undefined}>
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
        onKeyUp={hold.onKeyUp}
        onBlur={hold.onBlur}
        onKeyDown={(event: KeyboardEvent<HTMLAnchorElement>) => {
          hold.onKeyDown(event);
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
      {tv ? null : (
        <ButtonLink variant="icon" href={detailsHref} aria-label={`Details for ${title}`} data-roving-item="">
          <Info aria-hidden="true" size={20} />
        </ButtonLink>
      )}
    </li>
  );
}
