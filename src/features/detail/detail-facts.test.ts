import { describe, expect, it } from "vitest";
import type { ItemDetail } from "../../domain/catalog";
import { detailFacts } from "./detail-facts";

const base: ItemDetail = {
  id: "m1",
  type: "Movie",
  title: "Arrival",
  genres: [],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};

describe("detailFacts", () => {
  it("puts the ratings after the runtime and before the genres", () => {
    const item = { ...base, year: 2016, runTimeTicks: 70_200_000_000, genres: ["Sci-Fi", "Drama"], communityRating: 7.8, criticRating: 91 };
    expect(detailFacts(item)).toBe("2016 · 1 h 57 min · 7.8/10 · 91% critics · Sci-Fi · Drama");
  });

  it("shows a community rating alone on an episode", () => {
    const item = { ...base, type: "Episode", seasonNumber: 1, episodeNumber: 2, runTimeTicks: 27_000_000_000, communityRating: 8.25 };
    expect(detailFacts(item)).toBe("S1 · E2 · 45 min · 8.3/10");
  });

  it("joins the year, runtime, and first two genres for a movie", () => {
    const item = { ...base, year: 2016, runTimeTicks: 70_200_000_000, genres: ["Sci-Fi", "Drama", "Mystery"] };
    expect(detailFacts(item)).toBe("2016 · 1 h 57 min · Sci-Fi · Drama");
  });

  it("starts an episode with its season and episode numbers and still adds genres", () => {
    const item = { ...base, type: "Episode", year: 2020, seasonNumber: 1, episodeNumber: 2, runTimeTicks: 27_000_000_000, genres: ["Drama"] };
    expect(detailFacts(item)).toBe("S1 · E2 · 45 min · Drama");
  });

  it("leaves out unknown episode numbers and never shows the year for an episode", () => {
    const item = { ...base, type: "Episode", year: 2020, seasonNumber: 1, runTimeTicks: 27_000_000_000 };
    expect(detailFacts(item)).toBe("45 min");
  });

  it("is undefined when there is nothing to show", () => {
    expect(detailFacts(base)).toBeUndefined();
  });
});
