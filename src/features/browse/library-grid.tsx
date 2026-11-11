import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { BrowseFilter, BrowseItemType } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor, toMediaCardProps } from "../card-view";
import { detailKey } from "../detail/detail-key";
import { useFocusDwell } from "../home/use-focus-dwell";
import { scopeFor } from "../query-scope";
import { useRovingFocus } from "../roving-focus";
import { BrowseToolbar, Button, InlineError, MediaCard } from "../shared/ui";
import { itemCountLabel } from "./item-count";
import { EmptyLibrary, FilteredEmpty, LibrarySkeleton } from "./library-states";
import { DEFAULT_LIBRARY_SORT, LIBRARY_SORTS, librarySort, parseLibrarySort, type LibrarySortId } from "./library-sort";
import { useAutoPaging } from "./use-auto-paging";
import "./library.css";

export const PAGE_SIZE = 60;

const PREFETCH_DWELL_MS = 300;
const PREFETCH_MS = 30_000;

const FILTER_OPTIONS: { value: BrowseFilter; label: string }[] = [
  { value: "IsUnplayed", label: "Unwatched" },
  { value: "IsFavorite", label: "Favorites" },
  { value: "IsResumable", label: "In progress" },
];

const SORT_OPTIONS = LIBRARY_SORTS.map((sort) => ({ value: sort.id, label: sort.label }));

interface LibraryGridProps {
  gateway: SessionGateway;
  parentId: string;
  itemTypes: BrowseItemType[];
  // The accessible name of the grid section: the library or collection name.
  label: string;
  // What an error says it could not load: the library name, or "this collection".
  errorLabel?: string;
  initialSort?: LibrarySortId;
}

// The toolbar and the paged grid of a library or collection. Pages load as the end nears the viewport, and
// "Load more" stays as the keyboard fallback. A change of sort or filter changes the query key, which starts at page one.
export function LibraryGrid({ gateway, parentId, itemTypes, label, errorLabel = label, initialSort = DEFAULT_LIBRARY_SORT }: LibraryGridProps) {
  const scope = scopeFor(gateway);
  const queryClient = useQueryClient();
  const [sortId, setSortId] = useState<LibrarySortId>(initialSort);
  const [filters, setFilters] = useState<BrowseFilter[]>([]);
  const { sortBy, sortOrder } = librarySort(sortId);

  const query = useInfiniteQuery({
    queryKey: ["browse", scope, "items", parentId, itemTypes, sortBy, sortOrder, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      gateway.libraryItems(parentId, { itemTypes, startIndex: pageParam, limit: PAGE_SIZE, sortBy, sortOrder, filters }, signal),
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length * PAGE_SIZE : undefined),
    gcTime: 0,
  });

  const cards = query.data?.pages.flatMap((page) => page.cards) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount;
  const imageUrl = imageUrlFor(gateway);

  const section = useRef<HTMLElement>(null);
  const grid = useRef<HTMLUListElement>(null);
  const loadMoreButton = useRef<HTMLButtonElement>(null);
  const focusCardAt = useRef<number | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const roving = useRovingFocus<HTMLUListElement>("grid", { spatial: true });
  const gridRef = (node: HTMLUListElement | null) => {
    roving.ref.current = node;
    grid.current = node;
  };
  const loadMoreRoving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  const schedule = useFocusDwell(PREFETCH_DWELL_MS);

  async function loadMore() {
    const before = cards.length;
    if (document.activeElement === loadMoreButton.current) focusCardAt.current = before;
    const result = await query.fetchNextPage();
    const added = (result.data?.pages.flatMap((page) => page.cards).length ?? before) - before;
    if (added > 0) setAnnouncement(`${added} more items loaded`);
    else focusCardAt.current = undefined;
  }

  // When the button had focus and it goes away, focus the first new card.
  useEffect(() => {
    const index = focusCardAt.current;
    if (index === undefined || cards.length <= index) return;
    focusCardAt.current = undefined;
    grid.current?.querySelectorAll<HTMLElement>("[data-media-card]")[index]?.focus();
  }, [cards.length]);

  const sentinel = useAutoPaging({
    enabled: query.hasNextPage && !query.isFetchingNextPage && !query.isError && cards.length > 0,
    onLoad: () => void loadMore(),
  });

  // Keep the sticky toolbar's height available so a focused card scrolls clear of it (DESIGN.md 9).
  useEffect(() => {
    const element = section.current;
    const bar = element?.querySelector<HTMLElement>(".ui-toolbar-wrap");
    if (!element || !bar) return undefined;
    const measure = () => element.style.setProperty("--toolbar-h", `${bar.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  // After a short rest on a Movie card, its detail is fetched so opening it is instant (DESIGN.md 9).
  function onGridFocus(event: React.FocusEvent<HTMLUListElement>) {
    roving.onFocus(event);
    const frame = (event.target as HTMLElement).closest<HTMLElement>("[data-media-card]");
    if (!frame) return;
    const index = Array.from(event.currentTarget.querySelectorAll("[data-media-card]")).indexOf(frame);
    const card = cards[index];
    if (!card || card.kind !== "Movie") return;
    schedule(() => {
      void queryClient.prefetchQuery({
        queryKey: detailKey(gateway, card.id),
        queryFn: ({ signal }) => gateway.itemDetail(card.id, signal),
        staleTime: PREFETCH_MS,
        gcTime: PREFETCH_MS,
      });
    });
  }

  function setFilter(value: string, on: boolean) {
    setFilters(FILTER_OPTIONS.map((option) => option.value).filter((filter) =>
      filter === value ? on : filters.includes(filter)));
  }

  function clearFilters() {
    setFilters([]);
    section.current?.querySelector<HTMLElement>(".ui-toolbar-filters [aria-pressed]")?.focus();
  }

  const firstPageFailed = query.isError && cards.length === 0;
  const empty = query.isSuccess && cards.length === 0;

  return (
    <section ref={section} className="library-grid" aria-label={label} aria-busy={query.isPending || query.isFetchingNextPage}>
      <BrowseToolbar
        sortOptions={SORT_OPTIONS}
        sortValue={sortId}
        onSortChange={(value) => setSortId(parseLibrarySort(value) ?? DEFAULT_LIBRARY_SORT)}
        filters={FILTER_OPTIONS.map((option) => ({ ...option, pressed: filters.includes(option.value) }))}
        onFilterChange={setFilter}
        count={totalCount === undefined ? undefined : itemCountLabel(totalCount)}
      />

      {query.isPending ? <LibrarySkeleton /> : null}
      {firstPageFailed ? (
        <InlineError spatial message={`Couldn't load ${errorLabel}.`} onRetry={() => void query.refetch()} />
      ) : null}
      {empty && filters.length === 0 ? <EmptyLibrary /> : null}
      {empty && filters.length > 0 ? <FilteredEmpty onClear={clearFilters} /> : null}
      {cards.length > 0 ? (
        <ul className="media-grid" data-variant="poster" data-spatial-row="" ref={gridRef} onKeyDown={roving.onKeyDown} onFocus={onGridFocus}>
          {cards.map((card) => (
            <li key={card.id}>
              <MediaCard {...toMediaCardProps(card, "poster", imageUrl)} />
            </li>
          ))}
        </ul>
      ) : null}
      {query.isError && cards.length > 0 ? (
        <InlineError spatial message="Couldn't load more items." onRetry={() => void loadMore()} />
      ) : null}
      <div ref={sentinel} aria-hidden="true" />
      {query.hasNextPage ? (
        <div className="library-load-more" data-spatial-row="" ref={loadMoreRoving.ref} onKeyDown={loadMoreRoving.onKeyDown} onFocus={loadMoreRoving.onFocus}>
          <Button ref={loadMoreButton} variant="secondary" data-roving-item="" disabled={query.isFetchingNextPage} onClick={() => void loadMore()}>
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
      <p role="status" className="visually-hidden">{announcement}</p>
    </section>
  );
}
