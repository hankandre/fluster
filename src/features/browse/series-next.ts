import type { EpisodeCard, Season, SeriesNextUp } from "../../domain/catalog";
import type { PlayRoute } from "../routes";

export interface SeriesPrimary {
  label: string;
  route: PlayRoute;
  // Fraction watched, for the ring on a Resume button.
  progress?: number;
}

function labelled(verb: string, season: number | undefined, episode: number | undefined): string {
  return season !== undefined && episode !== undefined ? `${verb} S${season} · E${episode}` : verb;
}

// The one action in the series header (DESIGN.md 7.7, 10). `nextUp` is the server's choice. Without one (for example
// a fully watched series), the first episode of `fallbackSeason` is offered from the start. No episode, no action.
export function seriesPrimary(nextUp: SeriesNextUp | undefined, fallback: EpisodeCard | undefined, fallbackSeason?: Season): SeriesPrimary | undefined {
  if (nextUp) {
    if (nextUp.resumePositionTicks !== undefined) {
      return {
        label: labelled("Resume", nextUp.seasonNumber, nextUp.episodeNumber),
        route: { itemId: nextUp.id, startTicks: nextUp.resumePositionTicks },
        ...(nextUp.progress !== undefined ? { progress: nextUp.progress } : {}),
      };
    }
    return { label: labelled("Play", nextUp.seasonNumber, nextUp.episodeNumber), route: { itemId: nextUp.id, startTicks: 0 } };
  }
  if (!fallback) return undefined;
  return {
    label: labelled("Play", fallback.seasonNumber ?? fallbackSeason?.indexNumber, fallback.episodeNumber),
    route: { itemId: fallback.id, startTicks: 0 },
  };
}

// Regular seasons in server order, then Specials (season 0) last.
export function orderSeasons(seasons: Season[]): Season[] {
  return [...seasons.filter((season) => season.indexNumber !== 0), ...seasons.filter((season) => season.indexNumber === 0)];
}

// The season that opens (Q10 A): the next episode's season, else the first regular season, else the first one.
// `ordered` comes from orderSeasons. A server that omits SeasonId is matched by season number.
export function initialSeason(ordered: Season[], nextUp: SeriesNextUp | undefined): Season | undefined {
  const bySeasonId = nextUp?.seasonId === undefined ? undefined : ordered.find((season) => season.id === nextUp.seasonId);
  const byNumber = nextUp?.seasonNumber === undefined ? undefined : ordered.find((season) => season.indexNumber === nextUp.seasonNumber);
  return bySeasonId ?? byNumber ?? ordered.find((season) => season.indexNumber !== 0) ?? ordered[0];
}
