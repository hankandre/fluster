import type { MediaCard } from "../../domain/catalog";

export interface Source<T> {
  status: "pending" | "error" | "success";
  data?: T;
}

export type HeroPick =
  | { status: "pending" }
  | { status: "none" }
  | { status: "ready"; card: MediaCard };

const PLAYABLE: ReadonlySet<string> = new Set(["Movie", "Episode"]);
const FEATURED: ReadonlySet<string> = new Set(["Movie", "Episode", "Series"]);

function firstOf(cards: MediaCard[] | undefined, kinds: ReadonlySet<string>): MediaCard | undefined {
  return cards?.find((card) => card.kind !== undefined && kinds.has(card.kind));
}

// Continue watching, then Next up, then the first non-empty Latest row. It waits while an earlier source is
// pending, so the hero never jumps to a later pick. BoxSets and unknown kinds are never heroes.
export function pickHero(
  resume: Source<MediaCard[]>,
  nextUp: Source<MediaCard[]>,
  views: Source<unknown[]>,
  latest: Source<MediaCard[]>[],
): HeroPick {
  for (const source of [resume, nextUp]) {
    if (source.status === "pending") return { status: "pending" };
    if (source.status === "success") {
      const card = firstOf(source.data, PLAYABLE);
      if (card) return { status: "ready", card };
    }
  }
  if (views.status === "pending") return { status: "pending" };
  if (views.status === "error") return { status: "none" };
  for (const source of latest) {
    if (source.status === "pending") return { status: "pending" };
    if (source.status === "success") {
      const card = firstOf(source.data, FEATURED);
      if (card) return { status: "ready", card };
    }
  }
  return { status: "none" };
}
