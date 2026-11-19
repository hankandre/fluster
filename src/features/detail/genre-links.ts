import type { ItemDetail, LibraryView } from "../../domain/catalog";
import { libraryRoute } from "../routes";

export const MAX_GENRES = 2;

// The library a film's or series' genres open (P16-06): the title's own library when its parent folder is a
// library of the fitting kind, otherwise the first library of that kind. Only films and series link.
export function genreLibrary(item: ItemDetail, views: readonly LibraryView[] | undefined): LibraryView | undefined {
  const kind = item.type === "Movie" ? "movies" : item.type === "Series" ? "tvshows" : undefined;
  if (!kind || !views) return undefined;
  const fitting = views.filter((view) => view.collectionType === kind);
  return fitting.find((view) => view.id === item.parentId) ?? fitting[0];
}

// The first genres of a film or series for its facts line. A genre links only when the server gave it an id and
// a library can be chosen; otherwise it stays plain text. Episodes and other kinds show no genres here.
export function genreLinks(item: ItemDetail, views: readonly LibraryView[] | undefined): { name: string; href?: string }[] {
  if (item.type !== "Movie" && item.type !== "Series") return [];
  const library = genreLibrary(item, views);
  return item.genres.slice(0, MAX_GENRES).map((name) => {
    const id = (item.genreItems ?? []).find((genre) => genre.name === name)?.id;
    return library && id ? { name, href: libraryRoute(library.id, undefined, [], id) } : { name };
  });
}
