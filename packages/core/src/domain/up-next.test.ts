import { describe, expect, it } from "vitest";
import type { MediaCard } from "./catalog";
import { continueWatchingRow, firstUnwatched, lastFinished, nextInCollection, pickUpNext, windowStart, type PlayedEntry, type RecentPlays } from "./up-next";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-20T12:00:00Z");
const ago = (days: number, extraMs = 0) => new Date(NOW - days * DAY + extraMs).toISOString();

const film = (id: string, lastPlayedAt?: string, extra: Partial<MediaCard> = {}): MediaCard => ({
  id, kind: "Movie", title: id, aspectRatio: 2 / 3, resumePositionTicks: 100, ...(lastPlayedAt ? { lastPlayedAt } : {}), ...extra,
});
const episode = (id: string, seriesId: string, addedAt?: string, extra: Partial<MediaCard> = {}): MediaCard => ({
  id, kind: "Episode", title: seriesId, aspectRatio: 16 / 9, seriesId, ...(addedAt ? { addedAt } : {}), ...extra,
});
const entry = (id: string, playedAt: string, seriesId?: string): PlayedEntry => ({
  id, kind: seriesId ? "Episode" : "Movie", playedAt, ...(seriesId ? { seriesId } : {}),
});
const plays = (entries: PlayedEntry[], complete = true): RecentPlays => ({ entries, complete });
const ids = (cards: MediaCard[]) => cards.map((c) => c.id);
const run = (input: { resume?: MediaCard[]; nextUp?: MediaCard[]; plays?: RecentPlays | undefined; window?: "7" | "14" | "30" | "all" }) =>
  continueWatchingRow({ resume: input.resume ?? [], nextUp: input.nextUp ?? [], plays: "plays" in input ? input.plays : plays([]), window: input.window ?? "14", now: NOW });

describe("windowStart", () => {
  it("counts back 7, 14, and 30 days and has no start for all", () => {
    expect(windowStart("7", NOW)).toBe(NOW - 7 * DAY);
    expect(windowStart("14", NOW)).toBe(NOW - 14 * DAY);
    expect(windowStart("30", NOW)).toBe(NOW - 30 * DAY);
    expect(windowStart("all", NOW)).toBeUndefined();
  });
});

describe("continueWatchingRow window boundary", () => {
  it.each([["7", 7], ["14", 14], ["30", 30]] as const)("keeps a Resume item last played exactly %s days ago and drops one a millisecond older", (window, days) => {
    const result = run({ window, resume: [film("on", ago(days)), film("before", ago(days, -1))] });
    expect(ids(result.row)).toEqual(["on"]);
    expect([...result.agedOutIds]).toEqual(["before"]);
  });

  it.each([["7", 7], ["14", 14], ["30", 30]] as const)("keeps a next episode whose series was finished exactly %s days ago and drops one a millisecond older", (window, days) => {
    const kept = run({ window, nextUp: [episode("e", "s")], plays: plays([entry("x", ago(days), "s")]) });
    const dropped = run({ window, nextUp: [episode("e", "s")], plays: plays([entry("x", ago(days, -1), "s")]) });
    expect(ids(kept.row)).toEqual(["e"]);
    expect(ids(dropped.row)).toEqual([]);
  });

  it("keeps everything with the all window", () => {
    const result = run({ window: "all", resume: [film("a", ago(900))], nextUp: [episode("e", "s")], plays: plays([entry("x", ago(900), "s")]) });
    expect(ids(result.row)).toEqual(["a", "e"]);
    expect(result.agedOutIds.size).toBe(0);
  });

  it("changes membership with the window", () => {
    const resume = [film("a", ago(10)), film("b", ago(20)), film("c", ago(40))];
    expect(ids(run({ window: "7", resume }).row)).toEqual([]);
    expect(ids(run({ window: "14", resume }).row)).toEqual(["a"]);
    expect(ids(run({ window: "30", resume }).row)).toEqual(["a", "b"]);
    expect(ids(run({ window: "all", resume }).row)).toEqual(["a", "b", "c"]);
  });

  it("keeps a Resume item with no date and sorts it after dated ones", () => {
    const result = run({ resume: [film("undated"), film("dated", ago(1))] });
    expect(ids(result.row)).toEqual(["dated", "undated"]);
  });
});

describe("continueWatchingRow new episodes", () => {
  const caughtUp = plays([entry("old", "2026-01-05T12:00:00Z", "s")]);

  it("keeps a caught-up series when its new episode arrived inside the window, even if the last play is older", () => {
    const result = run({ nextUp: [episode("e3", "s", ago(3))], plays: caughtUp });
    expect(ids(result.row)).toEqual(["e3"]);
  });

  it("drops it a window after the episode arrived", () => {
    const result = run({ nextUp: [episode("e3", "s", ago(15))], plays: caughtUp });
    expect(ids(result.row)).toEqual([]);
    expect(result.agedOutIds.has("e3")).toBe(true);
    expect(result.agedOutIds.has("s")).toBe(true);
  });

  it("drops an old unwatched episode of an abandoned series (added before the last play)", () => {
    const result = run({ nextUp: [episode("e2", "s", "2025-12-01T00:00:00Z")], plays: caughtUp });
    expect(ids(result.row)).toEqual([]);
  });

  it("does not bring back an episode that was added before the viewer's last play", () => {
    const result = run({ nextUp: [episode("e2", "s", ago(5))], plays: plays([entry("x", ago(2), "s")]), window: "7" });
    // Played two days ago: inside the window anyway.
    expect(ids(result.row)).toEqual(["e2"]);
    const stale = run({ nextUp: [episode("e2", "s", ago(30))], plays: plays([entry("x", ago(20), "s")]) });
    expect(ids(stale.row)).toEqual([]);
  });
});

describe("continueWatchingRow unknown series", () => {
  it("drops a series missing from a complete list unless a new episode arrived", () => {
    expect(ids(run({ nextUp: [episode("e", "s")], plays: plays([entry("x", ago(1), "other")]) }).row)).toEqual([]);
    expect(ids(run({ nextUp: [episode("e", "s", ago(2))], plays: plays([entry("x", ago(1), "other")]) }).row)).toEqual(["e"]);
  });

  it("drops a series missing from a full list when the list's oldest date is before the window", () => {
    const full = plays([entry("x", ago(1), "other"), entry("y", ago(40), "other2")], false);
    expect(ids(run({ nextUp: [episode("e", "s")], plays: full }).row)).toEqual([]);
  });

  it("keeps it, undated, when the full list's oldest date is inside the window", () => {
    const full = plays([entry("x", ago(1), "other"), entry("y", ago(5), "other2")], false);
    const result = run({ resume: [film("r", ago(10))], nextUp: [episode("e", "s")], plays: full });
    expect(ids(result.row)).toEqual(["r", "e"]);
  });

  it("keeps every next episode, undated, when the recently-played request failed", () => {
    const result = run({ resume: [film("r", ago(10))], nextUp: [episode("e1", "s1"), episode("e2", "s2")], plays: undefined });
    expect(ids(result.row)).toEqual(["r", "e1", "e2"]);
  });
});

describe("continueWatchingRow ordering", () => {
  it("interleaves a next episode by its series' last finish", () => {
    const result = run({
      resume: [film("film", "2026-06-18T12:00:00Z")],
      nextUp: [episode("ep", "s")],
      plays: plays([entry("x", "2026-06-19T12:00:00Z", "s")]),
    });
    expect(ids(result.row)).toEqual(["ep", "film"]);
  });

  it("keeps arrival order on ties, Resume before Next up", () => {
    const at = "2026-06-19T12:00:00Z";
    const result = run({ resume: [film("a", at), film("b", at)], nextUp: [episode("ep", "s")], plays: plays([entry("x", at, "s")]) });
    expect(ids(result.row)).toEqual(["a", "b", "ep"]);
  });

  it("puts undated cards last, Resume's before Next up's", () => {
    const result = run({ resume: [film("u")], nextUp: [episode("e1", "s1"), episode("e2", "s2")], plays: undefined });
    expect(ids(result.row)).toEqual(["u", "e1", "e2"]);
  });

  it("keeps 16 cards", () => {
    const resume = Array.from({ length: 20 }, (_, i) => film(`f${i}`, ago(1, -i * 1000)));
    expect(run({ resume }).row).toHaveLength(16);
  });
});

describe("lastFinished", () => {
  const list = plays([entry("x", ago(10)), entry("y", ago(20))]);
  it("is the newest entry when inside the window", () => {
    expect(lastFinished(list, "14", NOW)?.id).toBe("x");
  });
  it("is nothing when the newest entry is outside the window", () => {
    expect(lastFinished(list, "7", NOW)).toBeUndefined();
  });
  it("ignores the window for all", () => {
    expect(lastFinished(plays([entry("z", ago(400))]), "all", NOW)?.id).toBe("z");
  });
  it("is nothing without a list or entries", () => {
    expect(lastFinished(undefined, "all", NOW)).toBeUndefined();
    expect(lastFinished(plays([]), "all", NOW)).toBeUndefined();
  });
});

describe("nextInCollection and firstUnwatched", () => {
  const unplayed = (id: string, extra: Partial<MediaCard> = {}): MediaCard => ({ id, kind: "Movie", title: id, aspectRatio: 2 / 3, ...extra });
  it("takes the first unplayed member after the anchor", () => {
    const members = [unplayed("one", { played: true }), unplayed("two"), unplayed("three", { played: true }), unplayed("four")];
    expect(nextInCollection(members, "two", new Set())?.id).toBe("four");
    expect(nextInCollection(members, "one", new Set())?.id).toBe("two");
  });
  it("does not match when only earlier members are unplayed", () => {
    expect(nextInCollection([unplayed("a"), unplayed("b", { played: true })], "b", new Set())).toBeUndefined();
  });
  it("skips members with a saved position and aged-out members", () => {
    const members = [unplayed("a"), unplayed("b", { resumePositionTicks: 5 }), unplayed("c"), unplayed("d")];
    expect(nextInCollection(members, "a", new Set(["c"]))?.id).toBe("d");
  });
  it("is nothing when the anchor is not a member", () => {
    expect(nextInCollection([unplayed("a")], "z", new Set())).toBeUndefined();
  });
  it("picks the first similar title that is not played, not in progress, and not aged out", () => {
    const similar = [unplayed("a", { played: true }), unplayed("b", { resumePositionTicks: 1 }), unplayed("c"), unplayed("d")];
    expect(firstUnwatched(similar, new Set(["c"]))?.id).toBe("d");
  });
});

describe("pickUpNext", () => {
  const card = (id: string, kind: MediaCard["kind"] = "Movie"): MediaCard => ({ id, kind, title: id, aspectRatio: 2 / 3 });
  const none = new Set<string>();

  it("rule 1-2: the row's first card beats every other rule", () => {
    expect(pickUpNext({ row: [card("row")], agedOutIds: none, sequel: card("seq"), similar: card("sim"), latest: [[card("new")]] })).toEqual({ rule: "row", card: card("row") });
  });
  it("rule 3 beats rule 4 and 5", () => {
    expect(pickUpNext({ row: [], agedOutIds: none, sequel: card("seq"), similar: card("sim"), latest: [[card("new")]] }).rule).toBe("sequel");
  });
  it("rule 4 beats rule 5", () => {
    expect(pickUpNext({ row: [], agedOutIds: none, sequel: undefined, similar: card("sim"), latest: [[card("new")]] }).rule).toBe("similar");
  });
  it("rule 5 takes the first Movie, Episode, or Series of the first non-empty Latest row", () => {
    expect(pickUpNext({ row: [], agedOutIds: none, sequel: undefined, similar: undefined, latest: [[card("box", "BoxSet")], [card("s", "Series")]] })).toEqual({ rule: "newest", card: card("s", "Series") });
  });
  it("is none when nothing matches", () => {
    expect(pickUpNext({ row: [], agedOutIds: none, sequel: undefined, similar: undefined, latest: [[]] })).toEqual({ rule: "none" });
  });
  it("never picks an aged-out film, episode, or series by rules 3 to 5", () => {
    const aged = new Set(["old-film", "old-series", "old-sim", "old-seq"]);
    const result = pickUpNext({
      row: [], agedOutIds: aged, sequel: card("old-seq"), similar: card("old-sim"),
      latest: [[card("old-film"), card("old-series", "Series"), card("fresh")]],
    });
    expect(result).toEqual({ rule: "newest", card: card("fresh") });
  });
  it("skips the Series card of a series whose episode aged out, from the row result", () => {
    const { agedOutIds } = run({ nextUp: [episode("e", "s")], plays: plays([entry("x", ago(60), "s")]) });
    const result = pickUpNext({ row: [], agedOutIds, sequel: undefined, similar: undefined, latest: [[card("s", "Series"), card("n")]] });
    expect(result).toEqual({ rule: "newest", card: card("n") });
  });
});
