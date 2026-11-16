import type { MediaCard } from "./catalog";

// Home's "Continue watching" row and the hero's Up next pick (P16-02, proposal §2.2). Pure: no clock, no I/O.

export type ContinueWindow = "7" | "14" | "30" | "all";

export const DEFAULT_CONTINUE_WINDOW: ContinueWindow = "14";
export const CONTINUE_ROW_LIMIT = 16;

const DAY_MS = 86_400_000;

// One finished film or episode, from the recently-played list.
export interface PlayedEntry {
  id: string;
  kind: "Movie" | "Episode";
  seriesId?: string;
  playedAt: string;
}

// `entries` are newest first. `complete` is true when the server listed everything it has, so a title
// missing from `entries` has no finished play at all.
export interface RecentPlays {
  entries: PlayedEntry[];
  complete: boolean;
}

export interface ContinueRow {
  row: MediaCard[];
  // Ids the window removed, plus the series id of each removed episode. No hero rule may pick them.
  agedOutIds: ReadonlySet<string>;
}

// Where the window starts, in epoch milliseconds, or undefined when it has no limit.
export function windowStart(window: ContinueWindow, now: number): number | undefined {
  switch (window) {
    case "all":
      return undefined;
    case "7":
      return now - 7 * DAY_MS;
    case "14":
      return now - 14 * DAY_MS;
    case "30":
      return now - 30 * DAY_MS;
  }
}

function time(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? undefined : value;
}

// The newest finished play of a series, or the bound a missing series is known to be at or below.
type SeriesPlay =
  | { known: "at"; at: number }
  | { known: "none" }
  | { known: "atMost"; at: number }
  | { known: "unknown" };

function seriesPlay(seriesId: string | undefined, plays: RecentPlays | undefined): SeriesPlay {
  if (!plays) return { known: "unknown" };
  let newest: number | undefined;
  let oldest: number | undefined;
  for (const entry of plays.entries) {
    const at = time(entry.playedAt);
    if (at === undefined) continue;
    if (seriesId !== undefined && entry.seriesId === seriesId && (newest === undefined || at > newest)) newest = at;
    if (oldest === undefined || at < oldest) oldest = at;
  }
  if (newest !== undefined) return { known: "at", at: newest };
  if (plays.complete) return { known: "none" };
  return oldest === undefined ? { known: "unknown" } : { known: "atMost", at: oldest };
}

interface Entry {
  card: MediaCard;
  at: number | undefined;
  source: 0 | 1;
}

// Resume items and next episodes in one list, most recently played first (D1, D5, D6).
export function continueWatchingRow(input: {
  resume: MediaCard[];
  nextUp: MediaCard[];
  plays: RecentPlays | undefined;
  window: ContinueWindow;
  now: number;
}): ContinueRow {
  const { resume, nextUp, plays, window, now } = input;
  const start = windowStart(window, now);
  const aged = new Set<string>();
  const kept: Entry[] = [];

  const remove = (card: MediaCard) => {
    aged.add(card.id);
    if (card.seriesId) aged.add(card.seriesId);
  };

  for (const card of resume) {
    const at = time(card.lastPlayedAt);
    if (start !== undefined && at !== undefined && at < start) remove(card);
    else kept.push({ card, at, source: 0 });
  }

  for (const card of nextUp) {
    const play = seriesPlay(card.seriesId, plays);
    const added = time(card.addedAt);
    if (start === undefined) {
      kept.push({ card, at: play.known === "at" ? play.at : undefined, source: 1 });
      continue;
    }
    // A new episode after the viewer's last play brings the series back, for a window after it arrived.
    const arrivedAfter = (lastPlay: number | undefined) =>
      added !== undefined && added >= start && (lastPlay === undefined || added > lastPlay);
    switch (play.known) {
      case "at":
        if (play.at >= start || arrivedAfter(play.at)) kept.push({ card, at: play.at, source: 1 });
        else remove(card);
        break;
      case "none":
        if (arrivedAfter(undefined)) kept.push({ card, at: undefined, source: 1 });
        else remove(card);
        break;
      case "atMost":
        if (play.at >= start) kept.push({ card, at: undefined, source: 1 });
        else if (arrivedAfter(play.at)) kept.push({ card, at: undefined, source: 1 });
        else remove(card);
        break;
      case "unknown":
        kept.push({ card, at: undefined, source: 1 });
        break;
    }
  }

  // Dated first, newest first; undated after, Resume's before Next up's. Ties keep arrival order.
  const indexed = kept.map((entry, index) => ({ entry, index }));
  indexed.sort((a, b) => {
    const x = a.entry.at;
    const y = b.entry.at;
    if (x !== undefined && y !== undefined) return y - x || a.index - b.index;
    if (x !== undefined) return -1;
    if (y !== undefined) return 1;
    return a.entry.source - b.entry.source || a.index - b.index;
  });
  return { row: indexed.slice(0, CONTINUE_ROW_LIMIT).map(({ entry }) => entry.card), agedOutIds: aged };
}

// The newest finished title, when it is inside the window (open question 4: "Keep everything" has no limit).
export function lastFinished(plays: RecentPlays | undefined, window: ContinueWindow, now: number): PlayedEntry | undefined {
  const newest = plays?.entries[0];
  if (!newest) return undefined;
  const start = windowStart(window, now);
  if (start === undefined) return newest;
  const at = time(newest.playedAt);
  return at !== undefined && at >= start ? newest : undefined;
}

function isUnwatched(card: MediaCard): boolean {
  return card.played !== true && card.resumePositionTicks === undefined;
}

// Rule 3: the first unplayed member after the anchor, in the order the members arrive (release order).
export function nextInCollection(members: MediaCard[], anchorId: string, agedOutIds: ReadonlySet<string>): MediaCard | undefined {
  const at = members.findIndex((card) => card.id === anchorId);
  if (at < 0) return undefined;
  return members.slice(at + 1).find((card) => card.kind === "Movie" && isUnwatched(card) && !agedOutIds.has(card.id));
}

// Rule 4: the first similar title the viewer has not played.
export function firstUnwatched(cards: MediaCard[], agedOutIds: ReadonlySet<string>): MediaCard | undefined {
  return cards.find((card) => (card.kind === "Movie" || card.kind === "Series") && isUnwatched(card) && !agedOutIds.has(card.id));
}

export type UpNext =
  | { rule: "row" | "sequel" | "similar" | "newest"; card: MediaCard }
  | { rule: "none" };

const PLAYABLE: ReadonlySet<string> = new Set(["Movie", "Episode"]);
const FEATURED: ReadonlySet<string> = new Set(["Movie", "Episode", "Series"]);

function firstOf(cards: MediaCard[], kinds: ReadonlySet<string>, agedOutIds?: ReadonlySet<string>): MediaCard | undefined {
  return cards.find((card) => card.kind !== undefined && kinds.has(card.kind) && !agedOutIds?.has(card.id));
}

// The hero: the row's first card, else a sequel, else a similar title, else the newest addition. Rules 3 to 5
// never pick an aged-out id. `sequel` and `similar` are the already-fetched candidates of rules 3 and 4.
export function pickUpNext(input: {
  row: MediaCard[];
  agedOutIds: ReadonlySet<string>;
  sequel: MediaCard | undefined;
  similar: MediaCard | undefined;
  latest: MediaCard[][];
}): UpNext {
  const { row, agedOutIds, sequel, similar, latest } = input;
  const inRow = firstOf(row, PLAYABLE);
  if (inRow) return { rule: "row", card: inRow };
  if (sequel && !agedOutIds.has(sequel.id)) return { rule: "sequel", card: sequel };
  if (similar && !agedOutIds.has(similar.id)) return { rule: "similar", card: similar };
  for (const cards of latest) {
    const card = firstOf(cards, FEATURED, agedOutIds);
    if (card) return { rule: "newest", card };
  }
  return { rule: "none" };
}
