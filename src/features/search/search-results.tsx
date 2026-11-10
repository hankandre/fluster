import { useInfiniteQuery } from "@tanstack/react-query";
import type { SearchCard, SearchKind } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor, toMediaCardProps } from "../card-view";
import { RowError } from "../home/media-row";
import { scopeFor } from "../query-scope";
import { useRovingFocus } from "../roving-focus";
import { MediaCard } from "../shared/ui";

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

  let status = "";
  if (query.isPending) status = "Searching";
  else if (query.isSuccess) status = cards.length === 0 ? "No results" : `${cards.length} results${query.hasNextPage ? " so far" : ""}`;

  return (
    <section aria-label={`Results for ${term}`} aria-busy={query.isPending}>
      <p role="status" className="visually-hidden">{status}</p>
      {query.isPending ? <p aria-hidden="true">Searching…</p> : null}
      {query.isError && cards.length === 0 ? <RowError title="search results" onRetry={() => void query.refetch()} /> : null}
      {query.isSuccess && cards.length === 0 ? <p>No results for "{term}".</p> : null}
      {GROUPS.map((group) => {
        const groupCards = cards.filter((card) => card.kind === group.kind);
        if (groupCards.length === 0) return null;
        return (
          <ResultGroup key={group.kind} kind={group.kind} title={group.title} cards={groupCards} gateway={gateway} />
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

function ResultGroup({ kind, title, cards, gateway }: { kind: SearchKind; title: string; cards: SearchCard[]; gateway: SessionGateway }) {
  const roving = useRovingFocus<HTMLUListElement>("grid");
  const variant = kind === "Episode" ? "thumb" : "poster";
  const imageUrl = imageUrlFor(gateway);
  return (
    <section aria-labelledby={`results-${kind}`}>
      <h2 id={`results-${kind}`}>{title}</h2>
      <ul className="media-grid" data-variant={variant} {...roving}>
        {cards.map((card) => (
          <li key={card.id}>
            <MediaCard {...toMediaCardProps(card, variant, imageUrl)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
