import type { EpisodeCard, Season, SeriesNextUp } from "../../domain/catalog";
import type { PlayRoute } from "../routes";

export interface SeriesPrimary {
  label: string;
  route: PlayRoute;
  // Fraction watched, for the ring on a Resume button.
  progress?: number;
  // "S1 · E2" when both numbers are known. The Home hero repeats it in its facts line.
  numbering?: string;
}

// "S1 · E2", or undefined without both numbers. The label and the Home hero's facts token both use it.
export function episodeNumbering(season: number | undefined, episode: number | undefined): string | undefined {
  return season !== undefined && episode !== undefined ? `S${season} · E${episode}` : undefined;
}

function labelled(verb: string, numbering: string | undefined): string {
  return numbering ? `${verb} ${numbering}` : verb;
}

// The one action in the series header (DESIGN.md 7.7, 10). `nextUp` is the server's choice. Without one (for example
// a fully watched series), the first episode of `fallbackSeason` is offered from the start. No episode, no action.
export function seriesPrimary(nextUp: SeriesNextUp | undefined, fallback: EpisodeCard | undefined, fallbackSeason?: Season): SeriesPrimary | undefined {
  if (nextUp) {
    const numbering = episodeNumbering(nextUp.seasonNumber, nextUp.episodeNumber);
    const withNumbering = numbering ? { numbering } : {};
    if (nextUp.resumePositionTicks !== undefined) {
      return {
        label: labelled("Resume", numbering),
        route: { itemId: nextUp.id, startTicks: nextUp.resumePositionTicks },
        ...(nextUp.progress !== undefined ? { progress: nextUp.progress } : {}),
        ...withNumbering,
      };
    }
    return { label: labelled("Play", numbering), route: { itemId: nextUp.id, startTicks: 0 }, ...withNumbering };
  }
  if (!fallback) return undefined;
  const numbering = episodeNumbering(fallback.seasonNumber ?? fallbackSeason?.indexNumber, fallback.episodeNumber);
  return { label: labelled("Play", numbering), route: { itemId: fallback.id, startTicks: 0 }, ...(numbering ? { numbering } : {}) };
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

// The season whose first episode is offered when the server has no next episode.
export function fallbackSeasonOf(seasons: Season[] | undefined): Season | undefined {
  return seasons ? initialSeason(orderSeasons(seasons), undefined) : undefined;
}

// A query's state, as React Query reports it.
export interface Loaded<T> {
  status: "pending" | "error" | "success";
  data?: T | undefined;
}

export interface SeriesPrimaryState {
  pending: boolean;
  primary?: SeriesPrimary;
}

// The series header's decision, shared with the Home hero so the two cannot drift: pending while the answer is
// unknown, no action when Next Up fails, the server's next episode, else the first episode of the fallback season.
export function seriesPrimaryState(
  nextUp: Loaded<SeriesNextUp | null>,
  seasons: Loaded<Season[]>,
  fallback: Loaded<EpisodeCard[]>,
): SeriesPrimaryState {
  if (nextUp.status === "pending") return { pending: true };
  if (nextUp.status === "error") return { pending: false };
  if (nextUp.data) return { pending: false, primary: seriesPrimary(nextUp.data, undefined) };
  const fallbackSeason = fallbackSeasonOf(seasons.data);
  const pending = seasons.status === "pending" || (fallbackSeason !== undefined && fallback.status === "pending");
  const primary = seriesPrimary(undefined, fallback.data?.[0], fallbackSeason);
  return primary ? { pending, primary } : { pending };
}
