import { describe, expect, it } from "vitest";
import type { ItemDetail, Season } from "../../domain/catalog";
import { seriesFacts } from "./series-facts";

const series: ItemDetail = {
  id: "s1",
  type: "Series",
  title: "Harbor Lights",
  year: 2022,
  endYear: 2024,
  genres: ["Drama", "Mystery", "Thriller"],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};
const seasons: Season[] = [
  { id: "sp", name: "Specials", indexNumber: 0 },
  { id: "se1", name: "Season 1", indexNumber: 1 },
  { id: "se2", name: "Season 2", indexNumber: 2 },
];

describe("seriesFacts", () => {
  it("joins the year range, the season count without Specials, and two genres", () => {
    expect(seriesFacts(series, seasons)).toBe("2022–2024 · 2 seasons · Drama · Mystery");
  });

  it("shows one year when the end year is missing or equal", () => {
    expect(seriesFacts({ ...series, endYear: undefined }, seasons)).toBe("2022 · 2 seasons · Drama · Mystery");
    expect(seriesFacts({ ...series, endYear: 2022 }, seasons)).toBe("2022 · 2 seasons · Drama · Mystery");
  });

  it("says 1 season, and leaves the count out while loading or when there is none", () => {
    expect(seriesFacts(series, [seasons[1]])).toContain("1 season ·");
    expect(seriesFacts(series, undefined)).toBe("2022–2024 · Drama · Mystery");
    expect(seriesFacts(series, [seasons[0]])).toBe("2022–2024 · Drama · Mystery");
  });

  it("is undefined for an item with nothing to say", () => {
    expect(seriesFacts({ ...series, year: undefined, endYear: undefined, genres: [] }, undefined)).toBeUndefined();
  });
});
