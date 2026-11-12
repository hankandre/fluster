import { describe, expect, it } from "vitest";
import type { ItemDetail } from "../../domain/catalog";
import { toPlayableItem } from "./playable-item";

const episode: ItemDetail = {
  id: "e2",
  type: "Episode",
  title: "The Keeper's Log",
  seriesName: "Hearth",
  seasonNumber: 1,
  episodeNumber: 2,
  genres: [],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};

describe("toPlayableItem", () => {
  it("carries the season and episode numbers for the player's title", () => {
    expect(toPlayableItem(episode)).toMatchObject({ type: "Episode", name: "The Keeper's Log", seriesName: "Hearth", season: 1, episode: 2 });
  });

  it("leaves them out for a movie", () => {
    const movie = toPlayableItem({ ...episode, type: "Movie", seasonNumber: undefined, episodeNumber: undefined });
    expect(movie.season).toBeUndefined();
    expect(movie.episode).toBeUndefined();
  });
});
