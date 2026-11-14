import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import { ACCOUNT_GC_TIME } from "../query-scope";
import { episodesKey, seasonsKey, seriesNextUpKey } from "./series-keys";

// The three reads of the series page. The header and the season list share them through the query cache.
// Next Up caches null for "nothing is next", because a query cannot hold undefined.
export function useSeriesNextUp(gateway: SessionGateway, seriesId: string) {
  return useQuery({
    queryKey: seriesNextUpKey(gateway, seriesId),
    queryFn: async ({ signal }) => (await gateway.seriesNextUp(seriesId, signal)) ?? null,
    gcTime: ACCOUNT_GC_TIME,
  });
}

export function useSeriesSeasons(gateway: SessionGateway, seriesId: string) {
  return useQuery({
    queryKey: seasonsKey(gateway, seriesId),
    queryFn: ({ signal }) => gateway.seasons(seriesId, signal),
    gcTime: ACCOUNT_GC_TIME,
  });
}

export function useSeasonEpisodes(gateway: SessionGateway, seriesId: string, seasonId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: episodesKey(gateway, seriesId, seasonId ?? ""),
    queryFn: ({ signal }) => gateway.episodes(seriesId, seasonId!, signal),
    enabled: enabled && seasonId !== undefined,
    gcTime: ACCOUNT_GC_TIME,
  });
}
