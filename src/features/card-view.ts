import type { MouseEvent } from "react";
import type { ImageRef, LibraryView, MediaCard as CatalogCard } from "../domain/catalog";
import type { SessionGateway } from "../app/session";
import type { MediaCardProps, MediaCardVariant } from "./shared/ui";
import { cardRoute, openPlayer, playRoute, type PlayRoute } from "./routes";

// Widths are twice the wide-window token sizes (200 px poster, 384 px thumb).
export const POSTER_IMAGE_WIDTH = 400;
export const WIDE_IMAGE_WIDTH = 768;

export type ImageUrl = (image: ImageRef, width: number) => string;

export function imageUrlFor(gateway: Pick<SessionGateway, "imageUrl">): ImageUrl {
  return (image, width) => gateway.imageUrl(image.itemId, image.type, image.tag, width);
}

// The art a variant shows (DESIGN.md 7.5): posters use Primary; 16:9 cards use Thumb, then Backdrop, then Primary;
// an episode prefers its own Primary.
export function cardImageFor(card: CatalogCard, variant: MediaCardVariant): ImageRef | undefined {
  switch (variant) {
    case "poster":
      return card.image;
    case "thumb":
    case "library":
      return card.thumb ?? card.backdrop ?? card.image;
    case "episode": {
      const own = card.image && card.image.itemId === card.id ? card.image : undefined;
      return own ?? card.thumb ?? card.backdrop ?? card.image;
    }
  }
}

export function toMediaCardProps(card: CatalogCard, variant: MediaCardVariant, imageUrl: ImageUrl): MediaCardProps {
  const art = cardImageFor(card, variant);
  const width = variant === "poster" ? POSTER_IMAGE_WIDTH : WIDE_IMAGE_WIDTH;
  const href = cardRoute(card);
  return {
    variant,
    title: card.title,
    ...(card.subtitle ? { subtitle: card.subtitle } : {}),
    ...(href ? { href } : {}),
    ...(art ? { image: { src: imageUrl(art, width), ...(art.blurHash ? { blurHash: art.blurHash } : {}) } } : {}),
    ...(card.progress !== undefined ? { progress: card.progress } : {}),
    ...(card.remainingTicks !== undefined ? { remainingTicks: card.remainingTicks } : {}),
    ...(card.played ? { played: true } : {}),
    ...(card.unplayedCount !== undefined ? { unplayedCount: card.unplayedCount } : {}),
  };
}

export function toLibraryCardProps(view: LibraryView, imageUrl: ImageUrl): MediaCardProps {
  return {
    variant: "library",
    title: view.name,
    href: `#/next/browse/${encodeURIComponent(view.id)}`,
    ...(view.image
      ? { image: { src: imageUrl(view.image, WIDE_IMAGE_WIDTH), ...(view.image.blurHash ? { blurHash: view.image.blurHash } : {}) } }
      : {}),
  };
}

export function toMediaRowItems(cards: CatalogCard[], variant: MediaCardVariant, imageUrl: ImageUrl) {
  return cards.map((card) => ({ id: card.id, ...toMediaCardProps(card, variant, imageUrl) }));
}

export function toPlayRowItems(cards: CatalogCard[], imageUrl: ImageUrl, describedBy?: string) {
  return cards.map((card) => ({ id: card.id, ...toPlayCardProps(card, imageUrl, describedBy) }));
}

// A plain primary click opens the player in-app so Back returns here. A modified click keeps the browser default.
export function playActivation(route: PlayRoute): (event: MouseEvent<HTMLAnchorElement>) => void {
  return (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openPlayer(route);
  };
}

export function cardPlayRoute(card: CatalogCard): PlayRoute {
  return { itemId: card.id, startTicks: card.resumePositionTicks ?? 0 };
}

// A thumb card that plays on Enter or click and opens details on `i`. A card of an unknown kind stays plain.
export function toPlayCardProps(card: CatalogCard, imageUrl: ImageUrl, describedBy?: string): MediaCardProps {
  const props = toMediaCardProps(card, "thumb", imageUrl);
  const detailsHref = cardRoute(card);
  if (!detailsHref) return props;
  const route = cardPlayRoute(card);
  return {
    ...props,
    href: playRoute(route),
    onActivate: playActivation(route),
    detailsHref,
    ...(describedBy ? { describedBy } : {}),
  };
}

// The art behind a hero or the ambient layer: a wide image of the item, else its parent's.
export function heroArtFor(card: CatalogCard): ImageRef | undefined {
  return card.backdrop ?? card.parentBackdrop ?? card.thumb;
}

// Two buckets keep image cache hits (DESIGN.md 7.2).
export function backdropWidth(): number {
  return window.innerWidth <= 1280 ? 1280 : 1920;
}
