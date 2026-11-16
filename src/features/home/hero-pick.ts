import type { MediaCard } from "../../domain/catalog";
import { pickUpNext } from "../../domain/up-next";

export interface Source<T> {
  status: "pending" | "error" | "success";
  data?: T;
}

// A lazily fetched candidate: `idle` when nothing needs fetching.
export interface CandidateSource {
  status: "idle" | "pending" | "error" | "success";
  card?: MediaCard;
}

export type HeroPick =
  | { status: "pending" }
  | { status: "none" }
  | { status: "ready"; card: MediaCard };

// The hero is the Up next pick (src/domain/up-next.ts). This wrapper only waits while an earlier source is
// pending, so the hero never jumps to a later pick.
export function pickHero(input: {
  row: Source<MediaCard[]>;
  agedOutIds: ReadonlySet<string>;
  sequel: CandidateSource;
  similar: CandidateSource;
  views: Source<unknown[]>;
  latest: Source<MediaCard[]>[];
}): HeroPick {
  const { row, agedOutIds, sequel, similar, views, latest } = input;
  if (row.status === "pending") return { status: "pending" };
  const rowCards = row.status === "success" ? row.data ?? [] : [];
  const inRow = pickUpNext({ row: rowCards, agedOutIds, sequel: undefined, similar: undefined, latest: [] });
  if (inRow.rule === "row") return { status: "ready", card: inRow.card };

  if (sequel.status === "pending") return { status: "pending" };
  const sequelCard = sequel.status === "success" ? sequel.card : undefined;
  if (!sequelCard && similar.status === "pending") return { status: "pending" };
  const similarCard = similar.status === "success" ? similar.card : undefined;

  const upToLatest = (cards: MediaCard[][]) => pickUpNext({ row: [], agedOutIds, sequel: sequelCard, similar: similarCard, latest: cards });
  const early = upToLatest([]);
  if (early.rule !== "none") return { status: "ready", card: early.card };

  if (views.status === "pending") return { status: "pending" };
  if (views.status === "error") return { status: "none" };
  const cards: MediaCard[][] = [];
  for (const source of latest) {
    if (source.status === "pending") {
      const found = upToLatest(cards);
      return found.rule === "none" ? { status: "pending" } : { status: "ready", card: found.card };
    }
    if (source.status === "success") cards.push(source.data ?? []);
  }
  const found = upToLatest(cards);
  return found.rule === "none" ? { status: "none" } : { status: "ready", card: found.card };
}
