import { useQuery } from "@tanstack/react-query";
import type { ItemDetail, Season } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor, toMediaRowItems } from "../card-view";
import { MediaRow } from "../shared/ui";
import { seasonEpisodesKey, seriesSeasonsKey } from "./detail-key";

function findSeasonId(seasons: Season[], item: ItemDetail): string | undefined {
  const byNumber = item.seasonNumber === undefined ? undefined : seasons.find((season) => season.indexNumber === item.seasonNumber);
  return (byNumber ?? seasons.find((season) => item.seasonName !== undefined && season.name === item.seasonName))?.id;
}

function stripTitle(item: ItemDetail): string {
  if (item.seasonName) return `More from ${item.seasonName}`;
  if (item.seasonNumber !== undefined) return `More from Season ${item.seasonNumber}`;
  return "More from this season";
}

// The season's other episodes, as cards that open each episode's detail (Q9 A). Hidden for anything but an
// episode whose series is known, and when the season has no other episode. When the server omits SeasonId, the
// season is found among the series' seasons by number, then by name.
export function EpisodeStrip({ gateway, item }: { gateway: SessionGateway; item: ItemDetail }) {
  const { seriesId } = item;
  const isEpisode = item.type === "Episode" && seriesId !== undefined;
  const needsSeason = isEpisode && item.seasonId === undefined;
  const seasons = useQuery({
    queryKey: seriesSeasonsKey(gateway, seriesId ?? ""),
    queryFn: ({ signal }) => gateway.seasons(seriesId!, signal),
    enabled: needsSeason,
    gcTime: 0,
  });
  const seasonId = item.seasonId ?? (seasons.data ? findSeasonId(seasons.data, item) : undefined);
  const enabled = isEpisode && seasonId !== undefined;
  const query = useQuery({
    queryKey: seasonEpisodesKey(gateway, seriesId ?? "", seasonId ?? ""),
    queryFn: ({ signal }) => gateway.episodes(seriesId!, seasonId!, signal),
    enabled,
    gcTime: 0,
  });
  if (!isEpisode) return null;
  const title = stripTitle(item);
  const error = `Couldn't load ${title}.`;
  if (needsSeason && seasons.isError) {
    return <MediaRow title={title} variant="thumb" status="error" errorMessage={error} onRetry={() => void seasons.refetch()} />;
  }
  if (needsSeason && seasons.isSuccess && seasonId === undefined) return null;
  if (!enabled || query.isPending) return <MediaRow title={title} variant="thumb" status="pending" />;
  if (query.isError) {
    return <MediaRow title={title} variant="thumb" status="error" errorMessage={error} onRetry={() => void query.refetch()} />;
  }
  const others = query.data.filter((card) => card.id !== item.id);
  // The strip leaves the current episode out, so it opens at the episode after it (the one before it when last).
  const current = query.data.findIndex((card) => card.id === item.id);
  const startIndex = current < 0 ? 0 : Math.max(0, Math.min(current, others.length - 1));
  return <MediaRow title={title} variant="thumb" status="ready" items={toMediaRowItems(others, "thumb", imageUrlFor(gateway))} startIndex={startIndex} />;
}
