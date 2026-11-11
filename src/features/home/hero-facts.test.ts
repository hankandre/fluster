import { describe, expect, it } from "vitest";
import type { DynamicRange, ItemDetail, MediaCard } from "../../domain/catalog";
import { heroFacts, primaryAction } from "./hero-facts";

const MIN = 600_000_000;

function card(overrides: Partial<MediaCard>): MediaCard {
  return { id: "c1", title: "Title", aspectRatio: 1, ...overrides };
}

function detail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: "c1",
    type: "Movie",
    title: "Title",
    genres: [],
    cast: [],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions: [],
    ...overrides,
  };
}

function withVideo(width: number, hdr: DynamicRange): Partial<ItemDetail> {
  return { versions: [{ id: "v", name: "v", audio: [], subtitles: [], video: { width, hdr } }] };
}

describe("primaryAction", () => {
  it("resumes from the saved position", () => {
    expect(primaryAction(card({ kind: "Movie", resumePositionTicks: 41 * MIN })))
      .toEqual({ label: "Resume from 41:00", route: { itemId: "c1", startTicks: 41 * MIN } });
    expect(primaryAction(card({ kind: "Episode", resumePositionTicks: 61 * MIN, seasonNumber: 1, episodeNumber: 2 }))?.label)
      .toBe("Resume from 1:01:00");
  });

  it("plays a movie, and an episode with its numbers or without", () => {
    expect(primaryAction(card({ kind: "Movie" }))).toEqual({ label: "Play", route: { itemId: "c1", startTicks: 0 } });
    expect(primaryAction(card({ kind: "Episode", seasonNumber: 1, episodeNumber: 3 }))?.label).toBe("Play S1 · E3");
    expect(primaryAction(card({ kind: "Episode", seasonNumber: 1 }))?.label).toBe("Play");
  });

  it("plays a series' resolved episode from the start, and has no action until it resolves", () => {
    const series = card({ kind: "Series", resumePositionTicks: 5 * MIN });
    expect(primaryAction(series)).toBeUndefined();
    expect(primaryAction(series, { id: "e1", seasonNumber: 1, episodeNumber: 1 }))
      .toEqual({ label: "Play S1 · E1", route: { itemId: "e1", startTicks: 0 } });
    expect(primaryAction(series, { id: "e1" })?.label).toBe("Play");
  });

  it("has no action for a kind that cannot play", () => {
    expect(primaryAction(card({ kind: "BoxSet" }))).toBeUndefined();
    expect(primaryAction(card({}))).toBeUndefined();
  });
});

describe("heroFacts", () => {
  it("shows an episode's numbers and its time left or runtime", () => {
    const ep = card({ kind: "Episode", seasonNumber: 2, episodeNumber: 4, progress: 0.5, remainingTicks: 38 * MIN });
    expect(heroFacts(ep)).toBe("S2 · E4 · 38 min left");
    expect(heroFacts(card({ kind: "Episode", seasonNumber: 2, episodeNumber: 4 }), detail({ runTimeTicks: 45 * MIN }))).toBe("S2 · E4 · 45 min");
    expect(heroFacts(card({ kind: "Episode" }), detail({ runTimeTicks: 45 * MIN }))).toBe("45 min");
    expect(heroFacts(card({ kind: "Episode" }))).toBeUndefined();
  });

  it("shows a movie's year, runtime, 4K, and range", () => {
    const movie = card({ kind: "Movie" });
    expect(heroFacts(movie, detail({ year: 2016, runTimeTicks: 116 * MIN, ...withVideo(3840, "Dolby Vision / HDR10") })))
      .toBe("2016 · 1 h 56 min · 4K · Dolby Vision");
    expect(heroFacts(movie, detail({ year: 2016, ...withVideo(1920, "HDR10+") }))).toBe("2016 · HDR10+");
    expect(heroFacts(movie, detail({ year: 2016, ...withVideo(1920, "SDR") }))).toBe("2016");
    expect(heroFacts(movie, detail({ ...withVideo(3200, "Unknown") }))).toBe("4K");
    expect(heroFacts(card({ kind: "Movie", progress: 0.2, remainingTicks: 90 * MIN }), detail({ year: 2016 }))).toBe("2016 · 1 h 30 min left");
  });

  it.each([["HDR10"], ["HLG"], ["HDR"]] as const)("names the %s range as itself", (range) => {
    expect(heroFacts(card({ kind: "Movie" }), detail(withVideo(1920, range)))).toBe(range);
  });

  it("shows a series' year and up to two genres", () => {
    expect(heroFacts(card({ kind: "Series" }), detail({ year: 2020, genres: ["Drama", "Mystery", "Sci-Fi"] }))).toBe("2020 · Drama · Mystery");
    expect(heroFacts(card({ kind: "Series" }))).toBeUndefined();
  });
});
