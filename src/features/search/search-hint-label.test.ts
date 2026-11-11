import { describe, expect, it } from "vitest";
import type { SearchHint } from "../../domain/catalog";
import { kindLabel, suggestionLabel, suggestionMeta } from "./search-hint-label";

const movie: SearchHint = { id: "m1", name: "Arrival", kind: "Movie", year: 2016 };
const episode: SearchHint = { id: "e1", name: "The Keeper's Log", kind: "Episode", seriesName: "Harbor Lights", seasonNumber: 1, episodeNumber: 2, year: 2022 };

describe("kindLabel", () => {
  it("calls a series a Show", () => {
    expect(kindLabel("Movie")).toBe("Movie");
    expect(kindLabel("Series")).toBe("Show");
    expect(kindLabel("Episode")).toBe("Episode");
  });
});

describe("suggestionMeta", () => {
  it("shows the year and the type for a movie and a series", () => {
    expect(suggestionMeta(movie)).toBe("2016 · Movie");
    expect(suggestionMeta({ id: "s1", name: "Arrow", kind: "Series", year: 2012 })).toBe("2012 · Show");
  });

  it("shows only the type without a year", () => {
    expect(suggestionMeta({ id: "s1", name: "Arrow", kind: "Series" })).toBe("Show");
  });

  it("shows the series and number for an episode, not the year", () => {
    expect(suggestionMeta(episode)).toBe("Harbor Lights · S1 · E2 · Episode");
  });

  it("leaves out what an episode lacks", () => {
    expect(suggestionMeta({ ...episode, seasonNumber: undefined })).toBe("Harbor Lights · Episode");
    expect(suggestionMeta({ ...episode, seriesName: undefined })).toBe("S1 · E2 · Episode");
    expect(suggestionMeta({ id: "e2", name: "Pilot", kind: "Episode" })).toBe("Episode");
  });
});

describe("suggestionLabel", () => {
  it("joins the title and the meta parts with commas", () => {
    expect(suggestionLabel(movie)).toBe("Arrival, 2016, Movie");
    expect(suggestionLabel(episode)).toBe("The Keeper's Log, Harbor Lights, S1 · E2, Episode");
    expect(suggestionLabel({ id: "s1", name: "Arrow", kind: "Series" })).toBe("Arrow, Show");
  });
});
