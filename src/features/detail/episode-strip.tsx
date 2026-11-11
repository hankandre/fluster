import { useQuery } from "@tanstack/react-query";
import type { ItemDetail } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor, toMediaRowItems } from "../card-view";
import { MediaRow } from "../shared/ui";
import { seasonEpisodesKey } from "./detail-key";

function stripTitle(item: ItemDetail): string {
  if (item.seasonName) return `More from ${item.seasonName}`;
  if (item.seasonNumber !== undefined) return `More from Season ${item.seasonNumber}`;
  return "More from this season";
}

// The season's other episodes, as cards that open each episode's detail (Q9 A). Hidden for anything but an
// episode whose series and season are known, and when the season has no other episode.
export function EpisodeStrip({ gateway, item }: { gateway: SessionGateway; item: ItemDetail }) {
  const { seriesId, seasonId } = item;
  const enabled = item.type === "Episode" && seriesId !== undefined && seasonId !== undefined;
  const query = useQuery({
    queryKey: seasonEpisodesKey(gateway, seriesId ?? "", seasonId ?? ""),
    queryFn: ({ signal }) => gateway.episodes(seriesId!, seasonId!, signal),
    enabled,
    gcTime: 0,
  });
  if (!enabled) return null;
  const title = stripTitle(item);
  if (query.isPending) return <MediaRow title={title} variant="thumb" status="pending" />;
  if (query.isError) {
    return <MediaRow title={title} variant="thumb" status="error" errorMessage={`Couldn't load ${title}.`} onRetry={() => void query.refetch()} />;
  }
  const others = query.data.filter((card) => card.id !== item.id);
  return <MediaRow title={title} variant="thumb" status="ready" items={toMediaRowItems(others, "thumb", imageUrlFor(gateway))} />;
}
