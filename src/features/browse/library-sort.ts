import type { BrowseSortBy, BrowseSortOrder } from "../../domain/catalog";

export type LibrarySortId =
  | "name-asc"
  | "name-desc"
  | "added-desc"
  | "added-asc"
  | "released-desc"
  | "released-asc"
  | "rating-desc"
  | "rating-asc";

export interface LibrarySort {
  id: LibrarySortId;
  label: string;
  sortBy: BrowseSortBy;
  sortOrder: BrowseSortOrder;
}

// Each field and direction spelled out, in menu order (decisions-P13 Q12 B).
export const LIBRARY_SORTS: LibrarySort[] = [
  { id: "name-asc", label: "Name A to Z", sortBy: "SortName", sortOrder: "Ascending" },
  { id: "name-desc", label: "Name Z to A", sortBy: "SortName", sortOrder: "Descending" },
  { id: "added-desc", label: "Newest added first", sortBy: "DateCreated", sortOrder: "Descending" },
  { id: "added-asc", label: "Oldest added first", sortBy: "DateCreated", sortOrder: "Ascending" },
  { id: "released-desc", label: "Newest release first", sortBy: "PremiereDate", sortOrder: "Descending" },
  { id: "released-asc", label: "Oldest release first", sortBy: "PremiereDate", sortOrder: "Ascending" },
  { id: "rating-desc", label: "Highest rated first", sortBy: "CommunityRating", sortOrder: "Descending" },
  { id: "rating-asc", label: "Lowest rated first", sortBy: "CommunityRating", sortOrder: "Ascending" },
];

export const DEFAULT_LIBRARY_SORT: LibrarySortId = "name-asc";

export function librarySort(id: LibrarySortId): LibrarySort {
  return LIBRARY_SORTS.find((sort) => sort.id === id) ?? LIBRARY_SORTS[0];
}

// The id for a known string, otherwise undefined.
export function parseLibrarySort(value: string): LibrarySortId | undefined {
  return LIBRARY_SORTS.find((sort) => sort.id === value)?.id;
}
