import { useEffect, useRef } from "react";
import { readOnReturn, rememberForReturn } from "../shell/focus-return";

const SLOT = "library";

export interface LibraryReturn {
  pages: number;
}

function parse(value: unknown): LibraryReturn | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { pages } = value as Record<string, unknown>;
  return typeof pages === "number" ? { pages } : undefined;
}

// What a Back to this library entry restores besides what the route holds: how many pages were loaded. Read once,
// on mount, because the pending return ends as soon as the card has focus. A fresh visit gets nothing.
export function readLibraryReturn(): LibraryReturn | undefined {
  return parse(readOnReturn(SLOT));
}

interface PagedQuery {
  pages: number;
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage(): void;
}

// Remembers the page count for a later Back, and on a return loads pages until the remembered count is back.
// `catchingUp` is true meanwhile, so the screen marks itself busy and the return waits.
export function useLibraryReturn(restored: LibraryReturn | undefined, query: PagedQuery) {
  const wanted = useRef(restored?.pages ?? 0);
  const { pages, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const reached = pages >= wanted.current || isError || (!isPending && !hasNextPage);

  useEffect(() => {
    rememberForReturn(SLOT, { pages: Math.max(pages, wanted.current) });
  });
  useEffect(() => {
    if (wanted.current === 0) return;
    if (reached) wanted.current = 0;
    else if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  });

  return {
    catchingUp: wanted.current > 0 && !reached,
    // The user changed the sort or filters: what was remembered no longer applies.
    stopCatchUp: () => {
      wanted.current = 0;
    },
  };
}
