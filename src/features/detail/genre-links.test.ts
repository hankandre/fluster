import { describe, expect, it } from "vitest";
import type { ItemDetail, LibraryView } from "../../domain/catalog";
import { genreLibrary, genreLinks } from "./genre-links";

const views: LibraryView[] = [
  { id: "lib-sets", name: "Sets", collectionType: "boxsets" },
  { id: "lib-movies", name: "Movies", collectionType: "movies" },
  { id: "lib-movies-2", name: "Kids Movies", collectionType: "movies" },
  { id: "lib-shows", name: "Shows", collectionType: "tvshows" },
];

function item(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: "m1",
    type: "Movie",
    title: "The Long Quiet",
    genres: ["Drama", "Science Fiction", "Mystery"],
    genreItems: [{ id: "g-drama", name: "Drama" }, { id: "g-scifi", name: "Science Fiction" }, { id: "g-mystery", name: "Mystery" }],
    cast: [],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions: [],
    ...overrides,
  };
}

describe("genreLibrary", () => {
  it("prefers the library that is the title's parent", () => {
    expect(genreLibrary(item({ parentId: "lib-movies-2" }), views)?.id).toBe("lib-movies-2");
  });

  it("otherwise takes the first library of the fitting kind", () => {
    expect(genreLibrary(item({ parentId: "folder-x" }), views)?.id).toBe("lib-movies");
    expect(genreLibrary(item({ type: "Series" }), views)?.id).toBe("lib-shows");
  });

  it("ignores a parent of the wrong kind", () => {
    expect(genreLibrary(item({ parentId: "lib-shows" }), views)?.id).toBe("lib-movies");
  });

  it("gives nothing for episodes, boxsets, no fitting library, or unloaded views", () => {
    expect(genreLibrary(item({ type: "Episode" }), views)).toBeUndefined();
    expect(genreLibrary(item({ type: "BoxSet" }), views)).toBeUndefined();
    expect(genreLibrary(item(), [views[0]!])).toBeUndefined();
    expect(genreLibrary(item(), undefined)).toBeUndefined();
  });
});

describe("genreLinks", () => {
  it("links at most two genres to the library filtered to each", () => {
    expect(genreLinks(item(), views)).toEqual([
      { name: "Drama", href: "#/next/browse/lib-movies?genre=g-drama" },
      { name: "Science Fiction", href: "#/next/browse/lib-movies?genre=g-scifi" },
    ]);
  });

  it("leaves a genre without an id as plain text", () => {
    expect(genreLinks(item({ genreItems: [{ id: "g-scifi", name: "Science Fiction" }] }), views)).toEqual([
      { name: "Drama" },
      { name: "Science Fiction", href: "#/next/browse/lib-movies?genre=g-scifi" },
    ]);
    expect(genreLinks(item({ genreItems: undefined }), views).every((genre) => !genre.href)).toBe(true);
  });

  it("keeps plain text when no library can be chosen, and shows nothing for episodes", () => {
    expect(genreLinks(item(), undefined)).toEqual([{ name: "Drama" }, { name: "Science Fiction" }]);
    expect(genreLinks(item({ type: "Episode" }), views)).toEqual([]);
  });
});
