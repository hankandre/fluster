import type { Ref } from "react";
import { Film, FilterX } from "lucide-react";
import { useRovingFocus } from "../roving-focus";
import { Button, EmptyState, Skeleton } from "../shared/ui";

const SKELETON_CARDS = 12;

// The first page is loading: poster-shaped placeholders in the grid's own layout.
export function LibrarySkeleton() {
  return (
    <>
      <ul className="media-grid" data-variant="poster" aria-hidden="true">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <li key={index} data-testid="card-skeleton">
            <Skeleton width="var(--poster-w)" aspectRatio="2 / 3" />
          </li>
        ))}
      </ul>
      <p className="visually-hidden">Loading</p>
    </>
  );
}

export function EmptyLibrary() {
  return (
    <EmptyState icon={Film} title="Nothing in this library yet">
      Add media in Jellyfin, then come back.
    </EmptyState>
  );
}

export function FilteredEmpty({ onClear }: { onClear(): void }) {
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  return (
    <EmptyState
      icon={FilterX}
      title="Nothing matches these filters"
      action={(
        <div data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
          <Button variant="secondary" data-roving-item="" onClick={onClear}>Clear filters</Button>
        </div>
      )}
    />
  );
}

// The views list is loading: a title line, the toolbar's shape, and the grid placeholders.
export function LibraryPagePending() {
  return (
    <section className="library-grid" aria-busy="true">
      <div className="library-toolbar-skeleton">
        <Skeleton shape="block" width="var(--skeleton-action-w)" height="var(--control-h)" />
      </div>
      <LibrarySkeleton />
    </section>
  );
}

// The page title while the name is unknown: a hidden name for assistive technology and a placeholder line.
export function PendingTitle({ headingRef, name }: { headingRef: Ref<HTMLHeadingElement>; name: string }) {
  return (
    <h1 ref={headingRef} tabIndex={-1} className="library-title">
      <span className="visually-hidden">{name}</span>
      <Skeleton shape="line" width="var(--skeleton-title-w)" />
    </h1>
  );
}
