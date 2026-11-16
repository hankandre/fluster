import type { BrowseFilter, MediaCard } from "../domain/catalog";
import { DEFAULT_LIBRARY_SORT, LIBRARY_FILTERS, parseLibrarySort, type LibrarySortId } from "./browse/library-sort";

export function itemRoute(id: string): string {
  return `#/next/item/${encodeURIComponent(id)}`;
}

export function seriesRoute(id: string): string {
  return `#/next/series/${encodeURIComponent(id)}`;
}

const LIBRARY_PREFIX = "#/next/browse/";

// ?sort=<sortId>&filters=<a,b>. The default sort and no filters write nothing, so the bare route means the
// defaults. An explicit sort other than the default stays (See all opens Newest added first). Written by hand
// so the filter list keeps its literal commas.
function viewQuery(sort: LibrarySortId | undefined, filters: readonly BrowseFilter[]): string {
  const parts: string[] = [];
  if (sort && sort !== DEFAULT_LIBRARY_SORT) parts.push(`sort=${encodeURIComponent(sort)}`);
  const names = LIBRARY_FILTERS.filter((filter) => filters.includes(filter));
  if (names.length > 0) parts.push(`filters=${names.join(",")}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

// #/next/browse/<libraryId>, optionally with ?sort=<sortId>&filters=<a,b> to open the library in that view.
export function libraryRoute(id: string, sort?: LibrarySortId, filters: readonly BrowseFilter[] = []): string {
  return `${LIBRARY_PREFIX}${encodeURIComponent(id)}${viewQuery(sort, filters)}`;
}

export interface LibraryRoute {
  libraryId: string;
  // Absent when the route has no sort or names an unknown one.
  sort?: LibrarySortId;
  filters: BrowseFilter[];
}

export interface CollectionRoute {
  collectionId: string;
  sort?: LibrarySortId;
  filters: BrowseFilter[];
}

function parseViewRoute(hash: string, prefix: string): { id: string; sort?: LibrarySortId; filters: BrowseFilter[] } | undefined {
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
  return sort ? { id, sort, filters } : { id, filters };
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
  const { id, ...view } = route;
  return { collectionId: id, ...view };
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

const ITEM_PREFIX = "#/next/item/";

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
