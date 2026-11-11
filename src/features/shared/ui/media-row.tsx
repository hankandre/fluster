import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useState, type FocusEvent } from "react";
import { useRovingFocus } from "../../roving-focus";
import { Button } from "./button";
import { InlineError } from "./inline-error";
import { MediaCard, type MediaCardProps, type MediaCardVariant } from "./media-card";
import { Skeleton } from "./skeleton";
import "./media.css";

export interface MediaRowProps {
  title?: string;
  // The accessible name while there is no title.
  label?: string;
  variant: MediaCardVariant;
  status: "pending" | "error" | "ready";
  items?: (MediaCardProps & { id: string })[];
  onRetry?(): void;
  errorMessage?: string;
  // Called with the id of the card that takes focus.
  onItemFocus?(id: string): void;
}

const POSTER_SKELETONS = 8;
const THUMB_SKELETONS = 5;

// One horizontal row of cards (DESIGN.md 7.4). The list bleeds to the window edges, keeps the focused card
// one gutter from them, and joins the spatial Up and Down focus between rows.
export function MediaRow({ title, label, variant, status, items = [], onRetry, errorMessage, onItemFocus }: MediaRowProps) {
  const headingId = useId();
  const roving = useRovingFocus<HTMLUListElement>("row", { spatial: true });
  const [canScroll, setCanScroll] = useState({ previous: false, next: false });

  const measure = useCallback(() => {
    const list = roving.ref.current;
    if (!list) return;
    const previous = list.scrollLeft > 1;
    const next = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setCanScroll((current) => (current.previous === previous && current.next === next ? current : { previous, next }));
  }, [roving.ref]);

  useLayoutEffect(measure, [measure, items.length, status]);
  useEffect(() => {
    const list = roving.ref.current;
    if (!list || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure, roving.ref, status]);

  if (status === "ready" && items.length === 0) return null;

  function page(direction: 1 | -1) {
    const list = roving.ref.current;
    if (!list) return;
    const gutter = parseFloat(getComputedStyle(list).paddingInlineStart) || 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    list.scrollBy({ left: direction * (list.clientWidth - 2 * gutter), behavior: reduced ? "auto" : "smooth" });
  }

  function onFocus(event: FocusEvent<HTMLUListElement>) {
    roving.onFocus(event);
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-media-card]");
    if (card && onItemFocus) {
      const index = Array.from(event.currentTarget.querySelectorAll("[data-media-card]")).indexOf(card);
      const focused = items[index];
      if (focused) onItemFocus(focused.id);
    }
    if (card && typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "nearest", inline: "nearest" });
    // The whole row is one box with its heading, so keeping it in view keeps the heading in view.
    const section = event.currentTarget.closest<HTMLElement>(".media-row");
    if (section && typeof section.scrollIntoView === "function") section.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const name = title ?? label;
  const skeletonCount = variant === "poster" ? POSTER_SKELETONS : THUMB_SKELETONS;
  const skeletonWidth = variant === "poster" ? "var(--poster-w)" : "var(--thumb-w)";
  const skeletonRatio = variant === "poster" ? "2 / 3" : "16 / 9";

  return (
    <section
      className="media-row"
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : label}
      aria-busy={status === "pending"}
    >
      {title ? <h2 id={headingId} className="media-row-title">{title}</h2> : null}
      {!title && status === "pending" ? <Skeleton shape="line" width="var(--thumb-w)" /> : null}
      {status === "pending" ? (
        <ul className="media-row-list" aria-hidden="true">
          {Array.from({ length: skeletonCount }, (_, index) => (
            <li key={index} data-testid="card-skeleton" data-variant={variant}>
              <Skeleton width={skeletonWidth} aspectRatio={skeletonRatio} />
            </li>
          ))}
        </ul>
      ) : null}
      {status === "error" ? (
        <InlineError message={errorMessage ?? `Couldn't load ${name ?? "this row"}.`} onRetry={onRetry} />
      ) : null}
      {status === "ready" ? (
        <div className="media-row-scroller">
          <ul className="media-row-list" data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={onFocus} onScroll={measure}>
            {items.map(({ id, ...card }) => (
              <li key={id}>
                <MediaCard {...card} />
              </li>
            ))}
          </ul>
          {canScroll.previous ? (
            <div className="media-row-page media-row-page--previous">
              <Button variant="icon" aria-label="Previous" aria-hidden="true" tabIndex={-1} onClick={() => page(-1)}>
                <ChevronLeft aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {canScroll.next ? (
            <div className="media-row-page media-row-page--next">
              <Button variant="icon" aria-label="Next" aria-hidden="true" tabIndex={-1} onClick={() => page(1)}>
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
