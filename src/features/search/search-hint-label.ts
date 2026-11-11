import type { SearchHint, SearchKind } from "../../domain/catalog";

// The type word the user reads: groups are "Movies, Shows, and Episodes" (DESIGN.md 10).
export function kindLabel(kind: SearchKind): string {
  switch (kind) {
    case "Movie":
      return "Movie";
    case "Series":
      return "Show";
    case "Episode":
      return "Episode";
  }
}

// The parts of the meta line after the title. An episode shows its series and number instead of a year.
function metaParts(hint: SearchHint): string[] {
  switch (hint.kind) {
    case "Movie":
    case "Series":
      return [...(hint.year != null ? [hint.year.toString()] : []), kindLabel(hint.kind)];
    case "Episode": {
      const numbered = hint.seasonNumber != null && hint.episodeNumber != null;
      return [
        ...(hint.seriesName ? [hint.seriesName] : []),
        ...(numbered ? [`S${hint.seasonNumber} · E${hint.episodeNumber}`] : []),
        kindLabel(hint.kind),
      ];
    }
  }
}

// "2016 · Movie", "Show", or "Harbor Lights · S1 · E2 · Episode".
export function suggestionMeta(hint: SearchHint): string {
  return metaParts(hint).join(" · ");
}

// The option's accessible name: "Arrival, 2016, Movie".
export function suggestionLabel(hint: SearchHint): string {
  return [hint.name, ...metaParts(hint)].join(", ");
}
