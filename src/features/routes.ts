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
