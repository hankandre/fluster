import type { ItemDetail, Season } from "../../domain/catalog";

const MAX_GENRES = 2;

// The facts line under a series name (DESIGN.md 7.7): "2022–2024 · 2 seasons · Drama · Mystery". No rating (Q8 A).
// Specials are not counted. The season count waits for the seasons to load.
export function seriesFacts(item: ItemDetail, seasons?: Season[]): string | undefined {
  const parts: (string | undefined)[] = [];
  if (item.year !== undefined) {
    parts.push(item.endYear !== undefined && item.endYear > item.year ? `${item.year}–${item.endYear}` : String(item.year));
  }
  const count = seasons?.filter((season) => season.indexNumber !== 0).length ?? 0;
  if (count > 0) parts.push(count === 1 ? "1 season" : `${count} seasons`);
  parts.push(...item.genres.slice(0, MAX_GENRES));
  const line = parts.filter(Boolean).join(" · ");
  return line || undefined;
}
