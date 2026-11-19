// Genres for the mock server (P16-06): ids for the names the movies and series carry, the per-library /Genres
// list, and the genreIds filter of /Items.
type Dto = Record<string, any>;

export const genreIdOf = (name: string): string => `genre-${name.toLowerCase().replace(/ /g, "-")}`;

// GenreItems as Jellyfin sends them next to Genres.
export const genreItemsOf = (names: string[] | undefined): Dto[] => (names ?? []).map((Name) => ({ Name, Id: genreIdOf(Name) }));

// The library a title sits in, as ParentId.
export const parentOf = (type: "Movie" | "Series"): string => (type === "Movie" ? "lib-movies" : "lib-shows");

// GET /Genres?parentId: the genres of the titles in that library, alphabetical. Other libraries have none.
export function genresDto(parent: string | null, movies: Record<string, Dto>, series: Record<string, Dto>): Dto {
  const source = parent === "lib-movies" ? Object.values(movies) : parent === "lib-shows" ? Object.values(series) : [];
  const names = [...new Set(source.flatMap((title) => (title.Genres as string[] | undefined) ?? []))].sort();
  return { Items: names.map((Name) => ({ Name, Id: genreIdOf(Name), Type: "Genre" })), TotalRecordCount: names.length, StartIndex: 0 };
}

// /Items?genreIds=<id>: keeps the titles that carry the genre. No genreIds keeps all.
export function filterByGenre<T extends Dto>(items: T[], genreIds: string | null): T[] {
  if (!genreIds) return items;
  const wanted = genreIds.split(",");
  return items.filter((item) => ((item.Genres as string[] | undefined) ?? []).some((name) => wanted.includes(genreIdOf(name))));
}
