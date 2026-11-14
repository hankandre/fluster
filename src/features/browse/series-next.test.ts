import { describe, expect, it } from "vitest";
import type { EpisodeCard, Season, SeriesNextUp } from "../../domain/catalog";
import { episodeNumbering, fallbackSeasonOf, initialSeason, orderSeasons, seriesPrimary, seriesPrimaryState, type Loaded } from "./series-next";

const next: SeriesNextUp = { id: "ep-2", title: "Second", seasonId: "se1", seasonNumber: 1, episodeNumber: 2 };
const card = (overrides: Partial<EpisodeCard> = {}): EpisodeCard => ({ id: "ep-1", title: "Pilot", aspectRatio: 1.78, ...overrides });

describe("seriesPrimary", () => {
  it("resumes a part-watched episode with its position and progress", () => {
    expect(seriesPrimary({ ...next, resumePositionTicks: 500, progress: 0.4 }, undefined)).toEqual({
      label: "Resume S1 · E2",
      route: { itemId: "ep-2", startTicks: 500 },
      progress: 0.4,
      numbering: "S1 · E2",
    });
  });

  it("resumes without numbers or progress when the server sent none", () => {
    expect(seriesPrimary({ id: "ep-2", title: "Second", resumePositionTicks: 500 }, undefined)).toEqual({
      label: "Resume",
      route: { itemId: "ep-2", startTicks: 500 },
    });
  });

  it("plays the next episode from the start", () => {
    expect(seriesPrimary(next, undefined)).toEqual({ label: "Play S1 · E2", route: { itemId: "ep-2", startTicks: 0 }, numbering: "S1 · E2" });
    expect(seriesPrimary({ id: "ep-2", title: "Second" }, undefined)?.label).toBe("Play");
  });

  it("falls back to the first episode, taking the season number from the card, then from the season", () => {
    expect(seriesPrimary(undefined, card({ seasonNumber: 1, episodeNumber: 1 }))).toEqual({
      label: "Play S1 · E1",
      route: { itemId: "ep-1", startTicks: 0 },
      numbering: "S1 · E1",
    });
    expect(seriesPrimary(undefined, card({ episodeNumber: 1 }), { id: "se1", name: "Season 1", indexNumber: 1 })?.label).toBe("Play S1 · E1");
    expect(seriesPrimary(undefined, card({ episodeNumber: 1 }), { id: "sp", name: "Specials", indexNumber: 0 })?.label).toBe("Play S0 · E1");
    expect(seriesPrimary(undefined, card())?.label).toBe("Play");
  });

  it("offers nothing without a next episode or a first episode", () => {
    expect(seriesPrimary(undefined, undefined)).toBeUndefined();
  });
});

const sp: Season = { id: "sp", name: "Specials", indexNumber: 0 };
const s1: Season = { id: "se1", name: "Season 1", indexNumber: 1 };
const s2: Season = { id: "se2", name: "Season 2", indexNumber: 2 };

describe("orderSeasons", () => {
  it("puts Specials last and keeps the server order otherwise", () => {
    expect(orderSeasons([sp, s2, s1]).map((season) => season.id)).toEqual(["se2", "se1", "sp"]);
  });

  it("keeps a Specials-only series and a series without index numbers as they are", () => {
    expect(orderSeasons([sp])).toEqual([sp]);
    const a = { id: "a", name: "A" };
    const b = { id: "b", name: "B" };
    expect(orderSeasons([a, b])).toEqual([a, b]);
  });
});

describe("initialSeason", () => {
  const ordered = orderSeasons([sp, s1, s2]);

  it("opens the next episode's season by id, then by number", () => {
    expect(initialSeason(ordered, { ...next, seasonId: "se2" })).toBe(s2);
    expect(initialSeason(ordered, { id: "e", title: "E", seasonNumber: 2 })).toBe(s2);
    expect(initialSeason(ordered, { id: "e", title: "E", seasonId: "gone", seasonNumber: 0 })).toBe(sp);
  });

  it("falls back to the first regular season, then to the first season", () => {
    expect(initialSeason(ordered, undefined)).toBe(s1);
    expect(initialSeason(ordered, { id: "e", title: "E" })).toBe(s1);
    expect(initialSeason([sp], undefined)).toBe(sp);
    expect(initialSeason([], undefined)).toBeUndefined();
  });
});

describe("episodeNumbering", () => {
  it("names both numbers, or nothing when one is missing", () => {
    expect(episodeNumbering(1, 2)).toBe("S1 · E2");
    expect(episodeNumbering(0, 1)).toBe("S0 · E1");
    expect(episodeNumbering(1, undefined)).toBeUndefined();
    expect(episodeNumbering(undefined, 2)).toBeUndefined();
  });
});

describe("seriesPrimaryState", () => {
  const specials: Season = { id: "sp", name: "Specials", indexNumber: 0 };
  const season1: Season = { id: "se1", name: "Season 1", indexNumber: 1 };
  const pending: Loaded<never> = { status: "pending" };
  const ok = <T,>(data: T): Loaded<T> => ({ status: "success", data });

  it("is pending while Next Up loads", () => {
    expect(seriesPrimaryState(pending, pending, pending)).toEqual({ pending: true });
  });

  it("offers nothing when Next Up fails", () => {
    expect(seriesPrimaryState({ status: "error" }, pending, pending)).toEqual({ pending: false });
  });

  it("resumes a part-watched next episode", () => {
    const state = seriesPrimaryState(ok({ ...next, resumePositionTicks: 500, progress: 0.4 }), pending, pending);
    expect(state).toEqual({
      pending: false,
      primary: { label: "Resume S1 · E2", route: { itemId: "ep-2", startTicks: 500 }, progress: 0.4, numbering: "S1 · E2" },
    });
  });

  it("plays a fresh next episode from the start", () => {
    const state = seriesPrimaryState(ok(next), pending, pending);
    expect(state.primary).toEqual({ label: "Play S1 · E2", route: { itemId: "ep-2", startTicks: 0 }, numbering: "S1 · E2" });
  });

  it("waits for the seasons, then for the fallback season's episodes", () => {
    expect(seriesPrimaryState(ok(null), pending, pending)).toEqual({ pending: true });
    expect(seriesPrimaryState(ok(null), ok([specials, season1]), pending)).toEqual({ pending: true });
  });

  it("falls back to the first episode of the first regular season", () => {
    const state = seriesPrimaryState(ok(null), ok([specials, season1]), ok([card({ episodeNumber: 1 })]));
    expect(state).toEqual({
      pending: false,
      primary: { label: "Play S1 · E1", route: { itemId: "ep-1", startTicks: 0 }, numbering: "S1 · E1" },
    });
  });

  it("offers nothing for a series without seasons", () => {
    expect(seriesPrimaryState(ok(null), ok([]), pending)).toEqual({ pending: false });
  });

  it("picks the fallback season the series page picks when a season has no number", () => {
    const unnumbered: Season = { id: "x", name: "Extras" };
    expect(fallbackSeasonOf([unnumbered, season1])).toBe(unnumbered);
    expect(fallbackSeasonOf([specials, season1])).toBe(season1);
    expect(fallbackSeasonOf(undefined)).toBeUndefined();
  });
});
