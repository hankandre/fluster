import type { ItemDetail } from "../../domain/catalog";
import { runtimeLabel } from "./format";

const MAX_GENRES = 2;

// The facts line under the title (DESIGN.md 7.7): "S1 · E2 · 45 min · Drama" for an episode,
// "2016 · 1 h 57 min · Sci-Fi" otherwise. No rating (Q8 A). Undefined when there is nothing to say.
export function detailFacts(item: ItemDetail): string | undefined {
  const parts: (string | undefined)[] = [];
  if (item.type === "Episode") {
    const numbered = item.seasonNumber !== undefined && item.episodeNumber !== undefined
      ? `S${item.seasonNumber} · E${item.episodeNumber}`
      : undefined;
    parts.push(numbered);
  } else {
    parts.push(item.year?.toString());
  }
  parts.push(runtimeLabel(item.runTimeTicks), ...item.genres.slice(0, MAX_GENRES));
  const line = parts.filter(Boolean).join(" · ");
  return line || undefined;
}
