import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  BrowseFilter,
  BrowseItemType,
  BrowseSortBy,
  BrowseSortOrder,
} from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { Card, RowError } from "../home/media-row";
import { scopeFor } from "../query-scope";

export const PAGE_SIZE = 60;

const SORT_OPTIONS: { value: BrowseSortBy; label: string }[] = [
  { value: "SortName", label: "Name" },
  { value: "DateCreated", label: "Date added" },
  { value: "PremiereDate", label: "Release date" },
  { value: "CommunityRating", label: "Rating" },
];

const FILTER_OPTIONS: { value: BrowseFilter; label: string }[] = [
  { value: "IsUnplayed", label: "Unwatched" },
  { value: "IsFavorite", label: "Favorites" },
  { value: "IsResumable", label: "In progress" },
];

interface LibraryGridProps {
  gateway: SessionGateway;
  parentId: string;
  itemTypes: BrowseItemType[];
  label: string;
}

// A paged grid of a library or collection. "Load more" fetches the next page;
// changing sort or filter changes the query key, which starts again at page one.
export function LibraryGrid({ gateway, parentId, itemTypes, label }: LibraryGridProps) {
  const scope = scopeFor(gateway);
  const [sortBy, setSortBy] = useState<BrowseSortBy>("SortName");
  const [sortOrder, setSortOrder] = useState<BrowseSortOrder>("Ascending");
  const [filters, setFilters] = useState<BrowseFilter[]>([]);

  const query = useInfiniteQuery({
    queryKey: ["browse", scope, "items", parentId, itemTypes, sortBy, sortOrder, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      gateway.libraryItems(parentId, { itemTypes, startIndex: pageParam, limit: PAGE_SIZE, sortBy, sortOrder, filters }, signal),
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length * PAGE_SIZE : undefined),
    gcTime: 0,
  });

  function toggleFilter(filter: BrowseFilter, on: boolean) {
    setFilters(FILTER_OPTIONS.map((option) => option.value).filter((value) =>
      value === filter ? on : filters.includes(value)));
  }

  const [announcement, setAnnouncement] = useState("");

  async function loadMore() {
    const before = cards.length;
    const result = await query.fetchNextPage();
    const added = (result.data?.pages.flatMap((page) => page.cards).length ?? before) - before;
    if (added > 0) setAnnouncement(`${added} more items loaded`);
  }

  const cards = query.data?.pages.flatMap((page) => page.cards) ?? [];

  return (
    <section className="browse-grid" aria-label={label} aria-busy={query.isPending}>
      <div className="browse-controls">
        <label>
          Sort by
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as BrowseSortBy)}>
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Order
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as BrowseSortOrder)}>
            <option value="Ascending">Ascending</option>
            <option value="Descending">Descending</option>
          </select>
        </label>
        <fieldset>
          <legend>Filter</legend>
          {FILTER_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={filters.includes(option.value)}
                onChange={(event) => toggleFilter(option.value, event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </div>

      {query.isError && cards.length === 0 ? <RowError title={label} onRetry={() => void query.refetch()} /> : null}
      {query.isSuccess && cards.length === 0 ? <p>Nothing here.</p> : null}
      {cards.length > 0 ? (
        <ul className="card-grid">
          {cards.map((card) => (
            <li key={card.id}>
              <Card card={card} gateway={gateway} />
            </li>
          ))}
        </ul>
      ) : null}
      {query.isError && cards.length > 0 ? <RowError title="more items" onRetry={() => void query.fetchNextPage()} /> : null}
      {query.hasNextPage ? (
        <button type="button" disabled={query.isFetchingNextPage} onClick={() => void loadMore()}>
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
      <p role="status" className="visually-hidden">{announcement}</p>
    </section>
  );
}
