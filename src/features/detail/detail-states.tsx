import type { Ref } from "react";
import { ButtonLink, InlineError, Notice, Skeleton } from "../shared/ui";

// Shaped like the header: a title block, a facts line, and two controls.
export function DetailSkeleton({ controls = 2 }: { controls?: number }) {
  return (
    <header className="detail-header" aria-busy="true">
      <div className="detail-text">
        <h1 className="visually-hidden">Loading details</h1>
        <Skeleton shape="block" width="var(--skeleton-title-w)" height="var(--space-8)" />
        <Skeleton shape="line" width="var(--skeleton-line-w)" />
        <div className="detail-skeleton-actions">
          {Array.from({ length: controls }, (_, index) => (
            <Skeleton key={index} shape="block" width="var(--skeleton-action-w)" height="var(--control-h)" />
          ))}
        </div>
      </div>
    </header>
  );
}

// The item is gone from the server (DESIGN.md 10, "Item gone").
export function ItemGoneNotice({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <Notice
      title="This item is no longer on the server"
      headingRef={headingRef}
      actions={<ButtonLink variant="primary" href="#/next/home">Go home</ButtonLink>}
    >
      It may have been removed or renamed.
    </Notice>
  );
}

export function DetailLoadError({ headingRef, onRetry }: { headingRef: Ref<HTMLHeadingElement>; onRetry(): void }) {
  return (
    <div className="detail-state">
      <h1 ref={headingRef} tabIndex={-1} className="visually-hidden">Couldn't load this item</h1>
      <InlineError message="Couldn't load this item." onRetry={onRetry} />
    </div>
  );
}
