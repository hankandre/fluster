import { useEffect, useRef } from "react";
import type { BrowseFilter } from "../../domain/catalog";
import { readOnReturn, rememberForReturn } from "../shell/focus-return";
import { parseLibrarySort, type LibrarySortId } from "./library-sort";

const SLOT = "library";
const FILTERS: BrowseFilter[] = ["IsUnplayed", "IsFavorite", "IsResumable"];

export interface LibraryReturn {
  sortId: LibrarySortId;
  filters: BrowseFilter[];
  pages: number;
}

function parse(value: unknown): LibraryReturn | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { sortId, filters, pages } = value as Record<string, unknown>;
  const sort = typeof sortId === "string" ? parseLibrarySort(sortId) : undefined;
  if (!sort || !Array.isArray(filters) || typeof pages !== "number") return undefined;
  return { sortId: sort, filters: FILTERS.filter((filter) => filters.includes(filter)), pages };
}

// What a Back to this library entry restores: the sort, the filters, and how many pages were loaded. Read once,
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

// Remembers the view for a later Back, and on a return loads pages until the remembered count is back.
// `catchingUp` is true meanwhile, so the screen marks itself busy and the return waits.
export function useLibraryReturn(restored: LibraryReturn | undefined, view: { sortId: LibrarySortId; filters: BrowseFilter[] }, query: PagedQuery) {
  const wanted = useRef(restored?.pages ?? 0);
  const { pages, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const reached = pages >= wanted.current || isError || (!isPending && !hasNextPage);

  useEffect(() => {
    rememberForReturn(SLOT, { ...view, pages: Math.max(pages, wanted.current) });
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
