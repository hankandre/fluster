import type { BrowseFilter, MediaCard } from "../domain/catalog";
import { DEFAULT_LIBRARY_SORT, LIBRARY_FILTERS, parseLibrarySort, type LibrarySortId } from "./browse/library-sort";

// The app lives under one prefix. Every route string is spelled here and nowhere else (P2-10).
export const FEATURE_INDEX_ROUTE = "#/next";
export const SIGN_IN_ROUTE = "#/next/sign-in";
export const HOME_ROUTE = "#/next/home";
export const SEARCH_ROUTE = "#/next/search";
export const SETTINGS_ROUTE = "#/next/settings";
export const GALLERY_ROUTE = "#/next/gallery";

const ITEM_PREFIX = "#/next/item/";
const SERIES_PREFIX = "#/next/series/";

// The search field with the results for a term.
export function searchResultsRoute(term: string): string {
  return `${SEARCH_ROUTE}/${encodeURIComponent(term)}`;
}

// True for the app's own hashes: the developer index and everything under it.
export function isAppHash(hash: string): boolean {
  return hash === FEATURE_INDEX_ROUTE || hash.startsWith(`${FEATURE_INDEX_ROUTE}/`);
}

// Routes that show the player, where the OSD speaks and no toast shows. Add any new player route here.
export function isPlayerHash(hash: string): boolean {
  return hash.startsWith(PLAY_PREFIX);
}

// The developer index links, in display order (browser development only).
export const FEATURE_INDEX_LINKS: readonly { name: string; href: string }[] = [
  { name: "sign-in", href: SIGN_IN_ROUTE },
  { name: "home", href: HOME_ROUTE },
  { name: "search", href: SEARCH_ROUTE },
  { name: "settings", href: SETTINGS_ROUTE },
];

export function itemRoute(id: string): string {
  return `${ITEM_PREFIX}${encodeURIComponent(id)}`;
}

export function seriesRoute(id: string): string {
  return `${SERIES_PREFIX}${encodeURIComponent(id)}`;
}

const LIBRARY_PREFIX = "#/next/browse/";

// ?sort=<sortId>&filters=<a,b>&genre=<id>. The default sort and no filters write nothing, so the bare route means the
// defaults. An explicit sort other than the default stays (See all opens Newest added first). Written by hand
// so the filter list keeps its literal commas.
function viewQuery(sort: LibrarySortId | undefined, filters: readonly BrowseFilter[], genreId?: string, fromTitle = false): string {
  const parts: string[] = [];
  if (sort && sort !== DEFAULT_LIBRARY_SORT) parts.push(`sort=${encodeURIComponent(sort)}`);
  const names = LIBRARY_FILTERS.filter((filter) => filters.includes(filter));
  if (names.length > 0) parts.push(`filters=${names.join(",")}`);
  if (genreId) parts.push(`genre=${encodeURIComponent(genreId)}`);
  // Set only by a title's genre link, so the library is a screen under that title (DESIGN.md §9).
  if (genreId && fromTitle) parts.push("from=title");
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

// #/next/browse/<libraryId>, optionally with ?sort=<sortId>&filters=<a,b>&genre=<id> to open the library in that view.
// `fromTitle` marks a genre library opened from a title's genre link; a view change that drops or changes the genre drops it.
export function libraryRoute(id: string, sort?: LibrarySortId, filters: readonly BrowseFilter[] = [], genreId?: string, fromTitle = false): string {
  return `${LIBRARY_PREFIX}${encodeURIComponent(id)}${viewQuery(sort, filters, genreId, fromTitle)}`;
}

export interface LibraryRoute {
  libraryId: string;
  // Absent when the route has no sort or names an unknown one.
  sort?: LibrarySortId;
  filters: BrowseFilter[];
  // One genre id; absent when the route has none.
  genreId?: string;
  // True when a title's genre link opened this genre library (`from=title`).
  fromTitle?: boolean;
}

export interface CollectionRoute {
  collectionId: string;
  sort?: LibrarySortId;
  filters: BrowseFilter[];
}

function parseViewRoute(hash: string, prefix: string): { id: string; sort?: LibrarySortId; filters: BrowseFilter[]; genreId?: string; fromTitle?: boolean } | undefined {
  if (!hash.startsWith(prefix)) return undefined;
  const rest = hash.slice(prefix.length);
  const queryStart = rest.indexOf("?");
  const encodedId = queryStart === -1 ? rest : rest.slice(0, queryStart);
  if (!encodedId || encodedId.includes("/")) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(encodedId);
  } catch {
    return undefined;
  }
  const params = new URLSearchParams(queryStart === -1 ? "" : rest.slice(queryStart + 1));
  const sort = parseLibrarySort(params.get("sort") ?? "");
  const named = (params.get("filters") ?? "").split(",");
  const filters = LIBRARY_FILTERS.filter((filter) => named.includes(filter));
  const genreId = params.get("genre") || undefined;
  const fromTitle = genreId !== undefined && params.get("from") === "title";
  return { id, ...(sort ? { sort } : {}), filters, ...(genreId ? { genreId } : {}), ...(fromTitle ? { fromTitle } : {}) };
}

// Reads a library route. A missing or malformed id is not a route.
export function parseLibraryRoute(hash: string): LibraryRoute | undefined {
  const route = parseViewRoute(hash, LIBRARY_PREFIX);
  if (!route) return undefined;
  const { id, ...view } = route;
  return { libraryId: id, ...view };
}

const COLLECTION_PREFIX = "#/next/collection/";

export function collectionRoute(id: string, sort?: LibrarySortId, filters: readonly BrowseFilter[] = []): string {
  return `${COLLECTION_PREFIX}${encodeURIComponent(id)}${viewQuery(sort, filters)}`;
}

// Reads a collection route. A missing or malformed id is not a route.
export function parseCollectionRoute(hash: string): CollectionRoute | undefined {
  const route = parseViewRoute(hash, COLLECTION_PREFIX);
  if (!route) return undefined;
  const { id, sort, filters } = route;
  return { collectionId: id, ...(sort ? { sort } : {}), filters };
}

export const ROUTE_REPLACED_EVENT = "fluster:route-replaced";

// Rewrites the current history entry's URL without a new entry or a hashchange. It keeps history.state, so the
// entry keeps its focus-return stamp. The app is told through ROUTE_REPLACED_EVENT.
export function replaceRoute(hash: string): void {
  if (hash === window.location.hash) return;
  window.history.replaceState(window.history.state, "", hash);
  window.dispatchEvent(new Event(ROUTE_REPLACED_EVENT));
}

// Where a card leads. A card of an unknown kind is not a link.
export function cardRoute(card: MediaCard): string | undefined {
  switch (card.kind) {
    case "Movie":
    case "Episode":
      return itemRoute(card.id);
    case "Series":
      return seriesRoute(card.id);
    case "BoxSet":
      return collectionRoute(card.id);
    default:
      return undefined;
  }
}

export interface PlayRoute {
  itemId: string;
  // The version chosen on the detail view; the server picks when absent.
  mediaSourceId?: string;
  // Where playback starts. Zero starts from the beginning.
  startTicks: number;
  // The audio track the viewer picked on the title's page (the Jellyfin stream index of `mediaSourceId`'s
  // version). Only the page's own play links set it; it is never carried to another title.
  audioStreamIndex?: number;
}

const PLAY_PREFIX = "#/next/play/";

export function playRoute({ itemId, mediaSourceId, startTicks, audioStreamIndex }: PlayRoute): string {
  const params = new URLSearchParams();
  if (mediaSourceId) params.set("source", mediaSourceId);
  if (mediaSourceId && audioStreamIndex !== undefined) params.set("audio", String(audioStreamIndex));
  if (startTicks > 0) params.set("start", String(startTicks));
  const query = params.toString();
  return `${PLAY_PREFIX}${encodeURIComponent(itemId)}${query ? `?${query}` : ""}`;
}

// Reads #/next/play/<itemId>?source=<mediaSourceId>&audio=<index>&start=<ticks>.
// A malformed id, start position, or audio index is not a route; an audio index without a source is dropped.
export function parsePlayRoute(hash: string): PlayRoute | undefined {
  if (!hash.startsWith(PLAY_PREFIX)) return undefined;
  const rest = hash.slice(PLAY_PREFIX.length);
  const queryStart = rest.indexOf("?");
  const encodedId = queryStart === -1 ? rest : rest.slice(0, queryStart);
  const params = new URLSearchParams(queryStart === -1 ? "" : rest.slice(queryStart + 1));
  if (!encodedId || encodedId.includes("/")) return undefined;

  let itemId: string;
  try {
    itemId = decodeURIComponent(encodedId);
  } catch {
    return undefined;
  }

  const start = params.get("start") ?? "0";
  if (!/^\d{1,18}$/.test(start)) return undefined;
  const source = params.get("source");
  const audio = params.get("audio");
  if (audio !== null && !/^\d{1,4}$/.test(audio)) return undefined;
  return {
    itemId,
    mediaSourceId: source || undefined,
    startTicks: Number(start),
    ...(source && audio !== null ? { audioStreamIndex: Number(audio) } : {}),
  };
}

// Reads #/next/item/<itemId>. A malformed or empty id is not a route.
export function parseItemRoute(hash: string): string | undefined {
  if (!hash.startsWith(ITEM_PREFIX)) return undefined;
  const rest = hash.slice(ITEM_PREFIX.length);
  const queryStart = rest.indexOf("?");
  const encodedId = queryStart === -1 ? rest : rest.slice(0, queryStart);
  if (!encodedId || encodedId.includes("/")) return undefined;
  try {
    return decodeURIComponent(encodedId);
  } catch {
    return undefined;
  }
}

// Opens the player from a screen that links to it (an item's detail view or Home) and marks the new
// history entry, so leaving the player can go back to the entry that opened it instead of adding one.
// It also records whether that entry was the item's own detail view, which "Back to details" needs.
export function openPlayer(route: PlayRoute): void {
  const openedFromItem = parseItemRoute(window.location.hash) === route.itemId;
  window.location.hash = playRoute(route);
  window.history.replaceState({ playerFromDetail: route.itemId, playerOpenedFromItem: openedFromItem }, "");
}

function playerState(): { playerFromDetail?: unknown; playerOpenedFromItem?: unknown } {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null ? state : {};
}

// Returns to the entry that opened the player: back through history when it was opened in-app,
// otherwise by replacing the player entry with the item's detail view.
export function leavePlayer(itemId: string): void {
  if (playerState().playerFromDetail === itemId) window.history.back();
  else window.location.replace(itemRoute(itemId));
}

// Always lands on the item's detail view. Back through history only when that is the entry that
// opened the player; otherwise the player entry is replaced, so browser Back never restarts playback.
export function leaveToDetails(itemId: string): void {
  const state = playerState();
  if (state.playerFromDetail === itemId && state.playerOpenedFromItem === true) window.history.back();
  else window.location.replace(itemRoute(itemId));
}

// Shows the sign-in screen, replacing the player entry so browser Back never reopens the player.
export function leaveToSignIn(): void {
  window.location.replace(SIGN_IN_ROUTE);
}

export type AppRoute =
  | { kind: "feature-index" }
  | { kind: "sign-in" }
  | { kind: "gallery" }
  | { kind: "home" }
  | { kind: "settings" }
  | { kind: "search"; term?: string }
  | ({ kind: "play" } & PlayRoute)
  | ({ kind: "library" } & LibraryRoute)
  | ({ kind: "collection" } & CollectionRoute)
  | { kind: "item"; itemId: string }
  | { kind: "series"; seriesId: string };

// Reads any app hash. A hash that is not a route, including a malformed id, gives undefined (Not found).
export function parseAppRoute(hash: string): AppRoute | undefined {
  switch (hash) {
    case FEATURE_INDEX_ROUTE:
      return { kind: "feature-index" };
    case SIGN_IN_ROUTE:
      return { kind: "sign-in" };
    case GALLERY_ROUTE:
      return { kind: "gallery" };
    case HOME_ROUTE:
      return { kind: "home" };
    case SETTINGS_ROUTE:
      return { kind: "settings" };
    case SEARCH_ROUTE:
      return { kind: "search" };
    default:
      break;
  }
  if (hash.startsWith(PLAY_PREFIX)) {
    const route = parsePlayRoute(hash);
    return route ? { kind: "play", ...route } : undefined;
  }
  if (hash.startsWith(LIBRARY_PREFIX)) {
    const route = parseLibraryRoute(hash);
    return route ? { kind: "library", ...route } : undefined;
  }
  if (hash.startsWith(COLLECTION_PREFIX)) {
    const route = parseCollectionRoute(hash);
    return route ? { kind: "collection", ...route } : undefined;
  }
  const [, , section, id, ...extra] = hash.split("/");
  if (!id || extra.length > 0) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    return undefined;
  }
  switch (section) {
    case "item":
      return { kind: "item", itemId: decoded };
    case "series":
      return { kind: "series", seriesId: decoded };
    case "search":
      return { kind: "search", term: decoded };
    default:
      return undefined;
  }
}

// Routes a signed-out viewer may open. Every other route sends them to sign-in.
export const OPEN_ROUTE_KINDS = ["feature-index", "sign-in", "gallery"] as const;
export type GuardedRouteKind = Exclude<AppRoute["kind"], (typeof OPEN_ROUTE_KINDS)[number]>;

export function isOpenRoute(route: AppRoute): boolean {
  switch (route.kind) {
    case "feature-index":
    case "sign-in":
    case "gallery":
      return true;
    case "home":
    case "settings":
    case "search":
    case "play":
    case "library":
    case "collection":
    case "item":
    case "series":
      return false;
    default: {
      const unreachable: never = route;
      return unreachable;
    }
  }
}

// True on a signed-in screen that is not a root tab, where the page shows a Back button (DESIGN.md §8). Roots are
// Home, Search, Settings, and a library (the nav's entries); the player has its own Back, and sign-in and the
// developer pages have no nav. An unknown hash counts as non-root, as Escape treats it. A new route kind fails to
// compile here until it is placed.
export function hasBackButton(hash: string): boolean {
  const route = parseAppRoute(hash);
  if (!route) return true;
  switch (route.kind) {
    case "home":
    case "search":
    case "settings":
    case "play":
    case "feature-index":
    case "sign-in":
    case "gallery":
      return false;
    // A genre library opened from a title's genre link is a screen under that title.
    case "library":
      return route.fromTitle === true;
    case "collection":
    case "item":
    case "series":
      return true;
    default: {
      const unreachable: never = route;
      return unreachable;
    }
  }
}
