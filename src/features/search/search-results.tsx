import { useInfiniteQuery } from "@tanstack/react-query";
import type { SearchCard, SearchKind } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { Card, RowError } from "../home/media-row";
import { scopeFor } from "../query-scope";
import { seriesRoute } from "./search-route";

export const RESULT_PAGE_SIZE = 40;

const GROUPS: { kind: SearchKind; title: string }[] = [
  { kind: "Movie", title: "Movies" },
  { kind: "Series", title: "Series" },
  { kind: "Episode", title: "Episodes" },
];

export function SearchResults({ gateway, term }: { gateway: SessionGateway; term: string }) {
  const query = useInfiniteQuery({
    queryKey: ["search", scopeFor(gateway), "items", term],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => gateway.searchItems(term, { startIndex: pageParam, limit: RESULT_PAGE_SIZE }, signal),
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length * RESULT_PAGE_SIZE : undefined),
    gcTime: 0,
  });

  const cards: SearchCard[] = query.data?.pages.flatMap((page) => page.cards) ?? [];

  return (
    <section aria-label={`Results for ${term}`} aria-busy={query.isPending}>
      {query.isPending ? <p>Searching…</p> : null}
      {query.isError && cards.length === 0 ? <RowError title="search results" onRetry={() => void query.refetch()} /> : null}
      {query.isSuccess && cards.length === 0 ? <p>No results for "{term}".</p> : null}
      {GROUPS.map((group) => {
        const groupCards = cards.filter((card) => card.kind === group.kind);
        if (groupCards.length === 0) return null;
        return (
          <section key={group.kind} aria-labelledby={`results-${group.kind}`}>
            <h2 id={`results-${group.kind}`}>{group.title}</h2>
            <ul className="card-grid">
              {groupCards.map((card) => (
                <li key={card.id}>
                  {/* Movies and episodes stay non-interactive until the detail view exists (P3-08). */}
                  <Card card={card} gateway={gateway} href={card.kind === "Series" ? seriesRoute(card.id) : undefined} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {query.isError && cards.length > 0 ? <RowError title="more results" onRetry={() => void query.fetchNextPage()} /> : null}
      {query.hasNextPage ? (
        <button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
