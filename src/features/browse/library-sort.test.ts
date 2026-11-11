import { describe, expect, it } from "vitest";
import { DEFAULT_LIBRARY_SORT, LIBRARY_SORTS, librarySort, parseLibrarySort } from "./library-sort";

describe("library sorts", () => {
  it("lists the eight choices in menu order", () => {
    expect(LIBRARY_SORTS.map((sort) => [sort.id, sort.label, sort.sortBy, sort.sortOrder])).toEqual([
      ["name-asc", "Name A to Z", "SortName", "Ascending"],
      ["name-desc", "Name Z to A", "SortName", "Descending"],
      ["added-desc", "Newest added first", "DateCreated", "Descending"],
      ["added-asc", "Oldest added first", "DateCreated", "Ascending"],
      ["released-desc", "Newest release first", "PremiereDate", "Descending"],
      ["released-asc", "Oldest release first", "PremiereDate", "Ascending"],
      ["rating-desc", "Highest rated first", "CommunityRating", "Descending"],
      ["rating-asc", "Lowest rated first", "CommunityRating", "Ascending"],
    ]);
  });

  it("defaults to name A to Z", () => {
    expect(DEFAULT_LIBRARY_SORT).toBe("name-asc");
    expect(librarySort(DEFAULT_LIBRARY_SORT).label).toBe("Name A to Z");
  });

  it("parses known ids only", () => {
    for (const sort of LIBRARY_SORTS) expect(parseLibrarySort(sort.id)).toBe(sort.id);
    for (const bad of ["", "Name", "added"]) expect(parseLibrarySort(bad)).toBeUndefined();
  });
});
