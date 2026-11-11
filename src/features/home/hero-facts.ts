import type { ItemDetail, MediaCard } from "../../domain/catalog";
import { positionLabel, runtimeLabel } from "../detail/format";
import { isFourK, rangeLabel } from "../detail/media-badges";
import type { PlayRoute } from "../routes";
import { timeLeftLabel } from "../shared/time-left";

export interface HeroEpisode {
  id: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface HeroAction {
  label: string;
  route: PlayRoute;
}

const MAX_GENRES = 2;

function numbered(season: number | undefined, episode: number | undefined): string | undefined {
  return season !== undefined && episode !== undefined ? `S${season} · E${episode}` : undefined;
}

// Resume or Play for the hero (DESIGN.md 10). A series plays the resolved episode from the start.
export function primaryAction(card: MediaCard, episode?: HeroEpisode): HeroAction | undefined {
  switch (card.kind) {
    case "Movie":
    case "Episode": {
      const ticks = card.resumePositionTicks ?? 0;
      if (ticks > 0) return { label: `Resume from ${positionLabel(ticks)}`, route: { itemId: card.id, startTicks: ticks } };
      const label = card.kind === "Episode" ? numbered(card.seasonNumber, card.episodeNumber) : undefined;
      return { label: label ? `Play ${label}` : "Play", route: { itemId: card.id, startTicks: 0 } };
    }
    case "Series": {
      if (!episode) return undefined;
      const label = numbered(episode.seasonNumber, episode.episodeNumber);
      return { label: label ? `Play ${label}` : "Play", route: { itemId: episode.id, startTicks: 0 } };
    }
    default:
      return undefined;
  }
}

function timeOrRuntime(card: MediaCard, detail: ItemDetail | undefined): string | undefined {
  if (card.progress !== undefined && card.remainingTicks !== undefined) return timeLeftLabel(card.remainingTicks);
  return runtimeLabel(detail?.runTimeTicks);
}

// One facts line, parts joined by " · " (DESIGN.md 7.3). Every part is optional.
export function heroFacts(card: MediaCard, detail?: ItemDetail): string | undefined {
  const parts: (string | undefined)[] = [];
  switch (card.kind) {
    case "Episode":
      parts.push(numbered(card.seasonNumber, card.episodeNumber), timeOrRuntime(card, detail));
      break;
    case "Movie": {
      const video = detail?.versions[0]?.video;
      parts.push(
        detail?.year?.toString(),
        timeOrRuntime(card, detail),
        isFourK(video?.width) ? "4K" : undefined,
        rangeLabel(video?.hdr),
      );
      break;
    }
    case "Series":
      parts.push(detail?.year?.toString(), ...(detail?.genres ?? []).slice(0, MAX_GENRES));
      break;
    default:
      break;
  }
  const line = parts.filter(Boolean).join(" · ");
  return line || undefined;
}
