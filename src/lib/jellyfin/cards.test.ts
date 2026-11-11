import { describe, expect, it } from "vitest";
import { toEpisodeCards, toHomeLibraries, toMediaCard, toSeriesNextUp } from "./cards";

describe("toMediaCard images and blurhashes", () => {
  it("looks up the blurhash by image type and tag", () => {
    const card = toMediaCard({
      Id: "m1",
      Name: "Movie",
      ImageTags: { Primary: "p1" },
      ImageBlurHashes: { Primary: { p1: "HASH-P", other: "NOPE" }, Backdrop: { p1: "HASH-B" } },
    });
    expect(card?.image).toEqual({ itemId: "m1", type: "Primary", tag: "p1", blurHash: "HASH-P" });
  });

  it("omits the blurhash when the tag has none", () => {
    const card = toMediaCard({ Id: "m1", Name: "Movie", ImageTags: { Primary: "p1" }, ImageBlurHashes: { Primary: { other: "X" } } });
    expect(card?.image).toEqual({ itemId: "m1", type: "Primary", tag: "p1" });
  });

  it("uses the series poster and its hash for an episode without its own image", () => {
    const card = toMediaCard({
      Id: "e1",
      Name: "Pilot",
      Type: "Episode",
      SeriesId: "s1",
      SeriesPrimaryImageTag: "sp",
      ImageBlurHashes: { Primary: { sp: "HASH-S" } },
    });
    expect(card?.image).toEqual({ itemId: "s1", type: "Primary", tag: "sp", blurHash: "HASH-S" });
  });

  it("falls back to the first backdrop with its hash", () => {
    const card = toMediaCard({ Id: "m1", Name: "Movie", BackdropImageTags: ["b1"], ImageBlurHashes: { Backdrop: { b1: "HASH-B" } } });
    expect(card?.image).toEqual({ itemId: "m1", type: "Backdrop", tag: "b1", blurHash: "HASH-B" });
  });
});

describe("toMediaCard logo and thumb", () => {
  it("maps own Logo and Thumb with their blurhashes", () => {
    const card = toMediaCard({
      Id: "m1",
      Name: "Movie",
      ImageTags: { Logo: "l1", Thumb: "t1" },
      ImageBlurHashes: { Logo: { l1: "HASH-L" }, Thumb: { t1: "HASH-T" } },
    });
    expect(card?.logo).toEqual({ itemId: "m1", type: "Logo", tag: "l1", blurHash: "HASH-L" });
    expect(card?.thumb).toEqual({ itemId: "m1", type: "Thumb", tag: "t1", blurHash: "HASH-T" });
  });

  it("falls back to the parent Logo and Thumb for an episode", () => {
    const card = toMediaCard({
      Id: "e1",
      Name: "Pilot",
      Type: "Episode",
      ParentLogoItemId: "s1",
      ParentLogoImageTag: "pl",
      ParentThumbItemId: "s1",
      ParentThumbImageTag: "pt",
      ImageBlurHashes: { Thumb: { pt: "HASH-PT" } },
    });
    expect(card?.logo).toEqual({ itemId: "s1", type: "Logo", tag: "pl" });
    expect(card?.thumb).toEqual({ itemId: "s1", type: "Thumb", tag: "pt", blurHash: "HASH-PT" });
  });

  it("omits logo and thumb when the item has neither", () => {
    const card = toMediaCard({ Id: "m1", Name: "Movie", ImageTags: { Primary: "p1" } });
    expect(card).not.toHaveProperty("logo");
    expect(card).not.toHaveProperty("thumb");
  });
});

describe("toMediaCard display fields", () => {
  it("sets remainingTicks only with progress", () => {
    const watching = toMediaCard({ Id: "m1", Name: "Movie", RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 400 } });
    expect(watching?.progress).toBe(0.4);
    expect(watching?.remainingTicks).toBe(600);
    const fresh = toMediaCard({ Id: "m2", Name: "Movie", RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 0 } });
    expect(fresh).not.toHaveProperty("remainingTicks");
    expect(fresh).not.toHaveProperty("progress");
  });

  it("maps the backdrop independently of the image", () => {
    const card = toMediaCard({
      Id: "m1",
      Name: "Movie",
      ImageTags: { Primary: "p1" },
      BackdropImageTags: ["b1"],
      ImageBlurHashes: { Backdrop: { b1: "HASH-B" } },
    });
    expect(card?.image?.type).toBe("Primary");
    expect(card?.backdrop).toEqual({ itemId: "m1", type: "Backdrop", tag: "b1", blurHash: "HASH-B" });
  });

  it("sets played only when true", () => {
    expect(toMediaCard({ Id: "m1", Name: "Movie", UserData: { Played: true } })?.played).toBe(true);
    expect(toMediaCard({ Id: "m1", Name: "Movie", UserData: { Played: false } })).not.toHaveProperty("played");
  });

  it("sets unplayedCount for a series with unwatched episodes only", () => {
    expect(toMediaCard({ Id: "s1", Name: "Show", Type: "Series", UserData: { UnplayedItemCount: 3 } })?.unplayedCount).toBe(3);
    expect(toMediaCard({ Id: "s1", Name: "Show", Type: "Series", UserData: { UnplayedItemCount: 0 } })).not.toHaveProperty("unplayedCount");
    expect(toMediaCard({ Id: "m1", Name: "Movie", Type: "Movie", UserData: { UnplayedItemCount: 3 } })).not.toHaveProperty("unplayedCount");
  });
});

describe("toMediaCard hero fields", () => {
  it("sets resumePositionTicks only when not played and the position is above zero", () => {
    expect(toMediaCard({ Id: "m1", Name: "M", UserData: { PlaybackPositionTicks: 600 } })?.resumePositionTicks).toBe(600);
    expect(toMediaCard({ Id: "m1", Name: "M", UserData: { PlaybackPositionTicks: 0 } })).not.toHaveProperty("resumePositionTicks");
    expect(toMediaCard({ Id: "m1", Name: "M", UserData: { Played: true, PlaybackPositionTicks: 600 } })).not.toHaveProperty("resumePositionTicks");
    expect(toMediaCard({ Id: "m1", Name: "M" })).not.toHaveProperty("resumePositionTicks");
  });

  it("sets season and episode numbers only for episodes that have both", () => {
    const base = { Id: "e1", Name: "Pilot", Type: "Episode" };
    const card = toMediaCard({ ...base, ParentIndexNumber: 2, IndexNumber: 4 });
    expect(card?.seasonNumber).toBe(2);
    expect(card?.episodeNumber).toBe(4);
    expect(toMediaCard({ ...base, IndexNumber: 4 })).not.toHaveProperty("seasonNumber");
    expect(toMediaCard({ ...base, ParentIndexNumber: 2 })).not.toHaveProperty("episodeNumber");
    expect(toMediaCard({ Id: "m1", Name: "M", Type: "Movie", ParentIndexNumber: 2, IndexNumber: 4 })).not.toHaveProperty("seasonNumber");
  });

  it("maps the parent backdrop with its blurhash, and skips it when the item has its own backdrop", () => {
    const parent = { ParentBackdropItemId: "s1", ParentBackdropImageTags: ["pb"], ImageBlurHashes: { Backdrop: { pb: "HASH-PB", own: "HASH-OWN" } } };
    expect(toMediaCard({ Id: "e1", Name: "Pilot", Type: "Episode", ...parent })?.parentBackdrop)
      .toEqual({ itemId: "s1", type: "Backdrop", tag: "pb", blurHash: "HASH-PB" });
    expect(toMediaCard({ Id: "e1", Name: "Pilot", Type: "Episode", BackdropImageTags: ["own"], ...parent })).not.toHaveProperty("parentBackdrop");
    expect(toMediaCard({ Id: "e1", Name: "Pilot", Type: "Episode", ParentBackdropItemId: "s1" })).not.toHaveProperty("parentBackdrop");
  });

  it("carries the numbers onto episode cards", () => {
    const [episode] = toEpisodeCards([{ Id: "e1", Name: "Pilot", Type: "Episode", ParentIndexNumber: 1, IndexNumber: 2 }]);
    expect(episode.seasonNumber).toBe(1);
    expect(episode.episodeNumber).toBe(2);
  });
});

describe("episode labels and episode cards", () => {
  it("labels an episode card S1 · E2 · Name, and the name alone without both numbers", () => {
    const numbered = { Id: "e1", Name: "Pilot", Type: "Episode", ParentIndexNumber: 1, IndexNumber: 2 };
    expect(toMediaCard(numbered)?.subtitle).toBe("S1 · E2 · Pilot");
    expect(toMediaCard({ ...numbered, ParentIndexNumber: undefined })?.subtitle).toBe("Pilot");
  });

  it("sets the runtime, and the episode number from the index alone, and keeps the Episode n subtitle", () => {
    const [episode] = toEpisodeCards([{ Id: "e1", Name: "Pilot", Type: "Episode", IndexNumber: 3, RunTimeTicks: 900 }]);
    expect(episode).toMatchObject({ runTimeTicks: 900, episodeNumber: 3, subtitle: "Episode 3", title: "Pilot" });
    const [bare] = toEpisodeCards([{ Id: "e2", Name: "Bare", Type: "Episode", RunTimeTicks: 0 }]);
    expect(bare).not.toHaveProperty("runTimeTicks");
    expect(bare).not.toHaveProperty("episodeNumber");
  });
});

describe("toSeriesNextUp", () => {
  const base = { Id: "e2", Name: "Second", Type: "Episode", SeasonId: "se1", ParentIndexNumber: 1, IndexNumber: 2, RunTimeTicks: 1000 };

  it("maps a part-watched episode with its position and progress", () => {
    expect(toSeriesNextUp({ ...base, UserData: { PlaybackPositionTicks: 400 } })).toEqual({
      id: "e2", title: "Second", seasonId: "se1", seasonNumber: 1, episodeNumber: 2, resumePositionTicks: 400, progress: 0.4,
    });
  });

  it("has no resume for a played or unstarted episode", () => {
    expect(toSeriesNextUp({ ...base, UserData: { Played: true, PlaybackPositionTicks: 400 } })).not.toHaveProperty("resumePositionTicks");
    expect(toSeriesNextUp(base)).not.toHaveProperty("progress");
  });

  it("returns undefined for a non-episode or an entry without an id", () => {
    expect(toSeriesNextUp({ ...base, Type: "Movie" })).toBeUndefined();
    expect(toSeriesNextUp({ ...base, Id: undefined })).toBeUndefined();
    expect(toSeriesNextUp(undefined)).toBeUndefined();
  });

  it("leaves out the numbers unless both are present, and the season id when missing", () => {
    const result = toSeriesNextUp({ ...base, SeasonId: null, ParentIndexNumber: undefined });
    expect(result).toEqual({ id: "e2", title: "Second" });
  });
});

describe("toHomeLibraries", () => {
  it("maps the Primary image with its blurhash", () => {
    const [library] = toHomeLibraries([
      { Id: "l1", Name: "Movies", CollectionType: "movies", ImageTags: { Primary: "p1" }, ImageBlurHashes: { Primary: { p1: "HASH-P" } } },
    ]);
    expect(library.image).toEqual({ itemId: "l1", type: "Primary", tag: "p1", blurHash: "HASH-P" });
  });

  it("omits the image when there is none", () => {
    const [library] = toHomeLibraries([{ Id: "l1", Name: "Movies", CollectionType: "movies" }]);
    expect(library).toEqual({ id: "l1", name: "Movies", collectionType: "movies" });
  });
});
