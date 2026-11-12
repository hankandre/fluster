import type { MediaCard } from "../domain/catalog";
import { parseLibrarySort, type LibrarySortId } from "./browse/library-sort";

export function itemRoute(id: string): string {
  return `#/next/item/${encodeURIComponent(id)}`;
}

export function seriesRoute(id: string): string {
  return `#/next/series/${encodeURIComponent(id)}`;
}

const LIBRARY_PREFIX = "#/next/browse/";

// #/next/browse/<libraryId>, optionally with ?sort=<sortId> to open the library in that order.
export function libraryRoute(id: string, sort?: LibrarySortId): string {
  const base = `${LIBRARY_PREFIX}${encodeURIComponent(id)}`;
  return sort ? `${base}?sort=${encodeURIComponent(sort)}` : base;
}

export interface LibraryRoute {
  libraryId: string;
  // Absent when the route has no sort or names an unknown one.
  sort?: LibrarySortId;
}

// Reads a library route. A missing or malformed id is not a route.
export function parseLibraryRoute(hash: string): LibraryRoute | undefined {
  if (!hash.startsWith(LIBRARY_PREFIX)) return undefined;
  const rest = hash.slice(LIBRARY_PREFIX.length);
  const queryStart = rest.indexOf("?");
  const encodedId = queryStart === -1 ? rest : rest.slice(0, queryStart);
  if (!encodedId || encodedId.includes("/")) return undefined;
  let libraryId: string;
  try {
    libraryId = decodeURIComponent(encodedId);
  } catch {
    return undefined;
  }
  const params = new URLSearchParams(queryStart === -1 ? "" : rest.slice(queryStart + 1));
  const sort = parseLibrarySort(params.get("sort") ?? "");
  return sort ? { libraryId, sort } : { libraryId };
}

export function collectionRoute(id: string): string {
  return `#/next/collection/${encodeURIComponent(id)}`;
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
}

const PLAY_PREFIX = "#/next/play/";

export function playRoute({ itemId, mediaSourceId, startTicks }: PlayRoute): string {
  const params = new URLSearchParams();
  if (mediaSourceId) params.set("source", mediaSourceId);
  if (startTicks > 0) params.set("start", String(startTicks));
  const query = params.toString();
  return `${PLAY_PREFIX}${encodeURIComponent(itemId)}${query ? `?${query}` : ""}`;
}

// Reads #/next/play/<itemId>?source=<mediaSourceId>&start=<ticks>.
// A malformed id or start position is not a route.
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
  return { itemId, mediaSourceId: source || undefined, startTicks: Number(start) };
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
