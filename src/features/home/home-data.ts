import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { LibraryView, MediaCard } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";

export interface LatestRow {
  view: LibraryView;
  query: UseQueryResult<MediaCard[]>;
}

export interface HomeData {
  scope: number;
  resume: UseQueryResult<MediaCard[]>;
  nextUp: UseQueryResult<MediaCard[]>;
  views: UseQueryResult<LibraryView[]>;
  latest: LatestRow[];
}

// Every Home query, started together so rows load in parallel, fail on their own, and share one cache with the
// hero and the empty state. Keys are ["home", scope, row, ...] (see home-queries.ts).
export function useHomeData(gateway: SessionGateway): HomeData {
  const scope = scopeFor(gateway);
  const resume = useQuery({ queryKey: ["home", scope, "resume"], queryFn: ({ signal }) => gateway.resumeItems(signal), gcTime: 0 });
  const nextUp = useQuery({ queryKey: ["home", scope, "next-up"], queryFn: ({ signal }) => gateway.nextUp(signal), gcTime: 0 });
  const views = useQuery({ queryKey: ["home", scope, "views"], queryFn: ({ signal }) => gateway.userViews(signal), gcTime: 0 });
  const libraries = views.data ?? [];
  const results = useQueries({
    queries: libraries.map((view) => ({
      queryKey: ["home", scope, "latest", view.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => gateway.latestInLibrary(view.id, signal),
      gcTime: 0,
    })),
  });
  return { scope, resume, nextUp, views, latest: libraries.map((view, index) => ({ view, query: results[index] })) };
}

// Every query has succeeded and nothing is left to show.
export function isHomeEmpty({ resume, nextUp, views, latest }: HomeData): boolean {
  if (!resume.isSuccess || !nextUp.isSuccess || !views.isSuccess) return false;
  if (resume.data.length > 0 || nextUp.data.length > 0) return false;
  return latest.every(({ query }) => query.isSuccess && query.data.length === 0);
}
