import { useMemo, useSyncExternalStore } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useOptionalPreferences } from "../../app/preferences";
import type { LibraryView, MediaCard } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import {
  continueWatchingRow,
  DEFAULT_CONTINUE_WINDOW,
  firstUnwatched,
  lastFinished,
  nextInCollection,
  type ContinueWindow,
  type PlayedEntry,
  type RecentPlays,
} from "../../domain/up-next";
import { ACCOUNT_GC_TIME, scopeFor } from "../query-scope";

export interface LatestRow {
  view: LibraryView;
  query: UseQueryResult<MediaCard[]>;
}

// What HomeRow reads from a row: a query, or the merged Continue watching row.
export interface RowQuery {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  data: MediaCard[] | undefined;
  refetch(): unknown;
}

// A lazily fetched hero candidate (rules 3 and 4). `idle` means nothing needs fetching.
export interface Candidate {
  status: "idle" | "pending" | "error" | "success";
  card?: MediaCard;
}

export interface HomeData {
  scope: number;
  continueRow: RowQuery;
  agedOutIds: ReadonlySet<string>;
  sequel: Candidate;
  similar: Candidate;
  views: UseQueryResult<LibraryView[]>;
  latest: LatestRow[];
  // The cards that can be focused on Home, for artwork and prefetch.
  rowCards: MediaCard[];
}

const noSubscribe = () => () => {};
const defaultWindow = (): ContinueWindow => DEFAULT_CONTINUE_WINDOW;

// The window the viewer chose in Settings; a change applies on the next render, with no refetch.
function useContinueWindow(): ContinueWindow {
  const store = useOptionalPreferences()?.continueWindow;
  return useSyncExternalStore(store ? store.subscribe : noSubscribe, store ? store.get : defaultWindow);
}

const NO_AGED_OUT: ReadonlySet<string> = new Set();

// Every Home query, started together so rows load in parallel, fail on their own, and share one cache with the
// hero and the empty state. Keys are ["home", scope, row, ...] (see home-queries.ts).
export function useHomeData(gateway: SessionGateway): HomeData {
  const scope = scopeFor(gateway);
  const window = useContinueWindow();
  const resume = useQuery({ queryKey: ["home", scope, "resume"], queryFn: ({ signal }) => gateway.resumeItems(signal), gcTime: ACCOUNT_GC_TIME });
  const nextUp = useQuery({ queryKey: ["home", scope, "next-up"], queryFn: ({ signal }) => gateway.nextUp(signal), gcTime: ACCOUNT_GC_TIME });
  // A failure here is silent (it only costs the ordering), so it does not retry and settles at once.
  const plays = useQuery({ queryKey: ["home", scope, "recently-played"], queryFn: ({ signal }) => gateway.recentlyPlayed(signal), gcTime: ACCOUNT_GC_TIME, retry: false });
  const views = useQuery({ queryKey: ["home", scope, "views"], queryFn: ({ signal }) => gateway.userViews(signal), gcTime: ACCOUNT_GC_TIME });
  const libraries = views.data ?? [];
  const results = useQueries({
    queries: libraries.map((view) => ({
      queryKey: ["home", scope, "latest", view.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => gateway.latestInLibrary(view.id, signal),
      gcTime: ACCOUNT_GC_TIME,
    })),
  });
  const latest = libraries.map((view, index) => ({ view, query: results[index] }));

  // The window's boundary is the newest fetch time, so it moves only when data is refetched.
  const now = Math.max(resume.dataUpdatedAt, nextUp.dataUpdatedAt, plays.dataUpdatedAt);
  const settled = !resume.isPending && !nextUp.isPending && !plays.isPending;
  const failed = resume.isError || nextUp.isError;
  const recent: RecentPlays | undefined = plays.data;

  const computed = useMemo(() => {
    if (!settled || failed || !resume.data || !nextUp.data) return undefined;
    return continueWatchingRow({ resume: resume.data, nextUp: nextUp.data, plays: recent, window, now });
  }, [settled, failed, resume.data, nextUp.data, recent, window, now]);

  const continueRow: RowQuery = {
    isPending: !settled && !failed,
    isError: failed,
    isSuccess: computed !== undefined,
    data: computed?.row,
    refetch: () => {
      if (resume.isError) void resume.refetch();
      if (nextUp.isError) void nextUp.refetch();
    },
  };
  const agedOutIds = computed?.agedOutIds ?? NO_AGED_OUT;

  // Rules 3 and 4 fetch only when the row has nothing to show and a finished title is inside the window.
  const rowDone = settled && (failed || computed?.row.length === 0);
  const anchor: PlayedEntry | undefined = rowDone ? lastFinished(recent, window, now) : undefined;
  const sequelQuery = useQuery({
    queryKey: ["home", scope, "sequel", anchor?.id],
    enabled: anchor?.kind === "Movie",
    queryFn: async ({ signal }) => {
      if (!anchor) return null;
      const collections = await gateway.itemCollections(anchor.id, signal);
      const first = collections?.[0];
      if (!first) return null;
      return nextInCollection(await gateway.collectionItems(first.id, signal), anchor.id, agedOutIds) ?? null;
    },
    gcTime: ACCOUNT_GC_TIME,
    retry: false,
  });
  const similarId = anchor?.kind === "Episode" ? anchor.seriesId : anchor?.id;
  const similarQuery = useQuery({
    queryKey: ["home", scope, "similar", similarId],
    enabled: similarId !== undefined,
    queryFn: async ({ signal }) => (similarId ? firstUnwatched(await gateway.similarItems(similarId, signal), agedOutIds) ?? null : null),
    gcTime: ACCOUNT_GC_TIME,
    retry: false,
  });

  const rowCards = useMemo(() => [...(computed?.row ?? [])], [computed]);
  return {
    scope,
    continueRow,
    agedOutIds,
    sequel: candidate(anchor?.kind === "Movie", sequelQuery),
    similar: candidate(similarId !== undefined, similarQuery),
    views,
    latest,
    rowCards,
  };
}

function candidate(wanted: boolean, query: UseQueryResult<MediaCard | null>): Candidate {
  if (!wanted) return { status: "idle" };
  if (query.isPending) return { status: "pending" };
  if (query.isError) return { status: "error" };
  return query.data ? { status: "success", card: query.data } : { status: "success" };
}

// Every query has succeeded and nothing is left to show.
export function isHomeEmpty({ continueRow, views, latest }: HomeData): boolean {
  if (!continueRow.isSuccess || !views.isSuccess) return false;
  if ((continueRow.data?.length ?? 0) > 0) return false;
  return latest.every(({ query }) => query.isSuccess && query.data.length === 0);
}
