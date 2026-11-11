import type { MediaCard } from "../domain/catalog";

export function itemRoute(id: string): string {
  return `#/next/item/${encodeURIComponent(id)}`;
}

export function seriesRoute(id: string): string {
  return `#/next/series/${encodeURIComponent(id)}`;
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

// Opens the player from a screen that links to it (an item's detail view or Home) and marks the new
// history entry, so leaving the player can go back to the entry that opened it instead of adding one.
export function openPlayer(route: PlayRoute): void {
  window.location.hash = playRoute(route);
  window.history.replaceState({ playerFromDetail: route.itemId }, "");
}

// Returns to the entry that opened the player: back through history when it was opened in-app,
// otherwise by replacing the player entry with the item's detail view.
export function leavePlayer(itemId: string): void {
  const state: unknown = window.history.state;
  const fromDetail = typeof state === "object" && state !== null
    && (state as { playerFromDetail?: unknown }).playerFromDetail === itemId;
  if (fromDetail) window.history.back();
  else window.location.replace(itemRoute(itemId));
}
