import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { SearchCard, SearchKind } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor, toMediaRowItems } from "../card-view";
import { detailKey } from "../detail/detail-key";
import { useFocusDwell } from "../home/use-focus-dwell";
import { scopeFor } from "../query-scope";
import { useRovingFocus } from "../roving-focus";
import { cardRoute } from "../routes";
import { Button, InlineError, MediaRow, type MediaCardVariant } from "../shared/ui";
import { SearchNoResults } from "./search-states";

export const RESULT_PAGE_SIZE = 40;
const PREFETCH_DWELL_MS = 300;
const PREFETCH_MS = 30_000;

const GROUPS: { kind: SearchKind; title: string; variant: MediaCardVariant }[] = [
  { kind: "Movie", title: "Movies", variant: "poster" },
  { kind: "Series", title: "Shows", variant: "poster" },
  { kind: "Episode", title: "Episodes", variant: "thumb" },
];

// What a Load more should focus once the page settles.
interface PendingFocus {
  shown: Set<string>;
  fromButton: boolean;
  // Set once the request has settled, success or failure.
  settled: boolean;
}

export function SearchResults({ gateway, term }: { gateway: SessionGateway; term: string }) {
  const query = useInfiniteQuery({
    queryKey: ["search", scopeFor(gateway), "items", term],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => gateway.searchItems(term, { startIndex: pageParam, limit: RESULT_PAGE_SIZE }, signal),
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length * RESULT_PAGE_SIZE : undefined),
    gcTime: 0,
  });
  const queryClient = useQueryClient();
  const schedule = useFocusDwell(PREFETCH_DWELL_MS);
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  const sectionRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<PendingFocus | undefined>(undefined);
  const [, setSettledCount] = useState(0);

  const cards: SearchCard[] = query.data?.pages.flatMap((page) => page.cards) ?? [];
  const groups = GROUPS.map((group) => ({ ...group, cards: cards.filter((card) => card.kind === group.kind) }));
  const imageUrl = imageUrlFor(gateway);

  // After a page settles, focus goes to the first new card, so a visible card never loses focus to the body.
  useEffect(() => {
    const wanted = pending.current;
    if (!wanted) return;
    if (!wanted.settled || query.isFetchingNextPage) return;
    pending.current = undefined;
    if (!wanted.fromButton) return;
    const fresh = groups.flatMap((group) => group.cards).find((card) => !wanted.shown.has(card.id));
    const route = fresh ? cardRoute(fresh) : undefined;
    const link = route
      ? Array.from(sectionRef.current?.querySelectorAll<HTMLElement>("[data-media-card]") ?? []).find((node) => node.getAttribute("href") === route)
      : undefined;
    if (link) link.focus();
    else if (loadMoreRef.current) loadMoreRef.current.focus();
    else document.querySelector<HTMLElement>("[data-search-field]")?.focus();
  });

  function loadMore() {
    pending.current = {
      shown: new Set(cards.map((card) => card.id)),
      fromButton: document.activeElement === loadMoreRef.current,
      settled: false,
    };
    const request = pending.current;
    // The promise settles after the query has new data; the state change then re-runs the effect above.
    void query.fetchNextPage().then(() => {
      request.settled = true;
      setSettledCount((count) => count + 1);
    });
  }

  // After the dwell, a Movie or Episode card's detail is fetched so opening it is instant (DESIGN.md 9).
  function onItemFocus(id: string) {
    const card = cards.find((candidate) => candidate.id === id);
    if (!card || card.kind === "Series") return;
    schedule(() => {
      void queryClient.prefetchQuery({
        queryKey: detailKey(gateway, card.id),
        queryFn: ({ signal }) => gateway.itemDetail(card.id, signal),
        staleTime: PREFETCH_MS,
        gcTime: PREFETCH_MS,
      });
    });
  }

  let status = "";
  if (query.isPending) status = "Searching";
  else if (query.isSuccess) status = cards.length === 0 ? "No results" : `${cards.length} results${query.hasNextPage ? " so far" : ""}`;

  const firstPageFailed = query.isError && cards.length === 0;

  return (
    <section ref={sectionRef} className="search-results" aria-label={`Results for ${term}`} aria-busy={query.isPending}>
      <p role="status" className="visually-hidden">{status}</p>
      {query.isPending ? <MediaRow label="Search results" variant="poster" status="pending" /> : null}
      {firstPageFailed ? <InlineError spatial message="Couldn't load search results." onRetry={() => void query.refetch()} /> : null}
      {query.isSuccess && cards.length === 0 ? <SearchNoResults term={term} /> : null}
      {groups.map((group) => (
        <MediaRow
          key={group.kind}
          title={group.title}
          variant={group.variant}
          status="ready"
          items={toMediaRowItems(group.cards, group.variant, imageUrl)}
          onItemFocus={onItemFocus}
        />
      ))}
      {query.isError && cards.length > 0 ? (
        <InlineError spatial message="Couldn't load more results." onRetry={() => void query.fetchNextPage()} />
      ) : null}
      {query.hasNextPage && !query.isError ? (
        <div className="search-load-more" data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
          <Button ref={loadMoreRef} variant="secondary" data-roving-item="" disabled={query.isFetchingNextPage} onClick={loadMore}>
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
