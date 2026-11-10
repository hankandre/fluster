import type { ImageRef, LibraryView, MediaCard as CatalogCard } from "../domain/catalog";
import type { SessionGateway } from "../app/session";
import type { MediaCardProps, MediaCardVariant } from "./shared/ui";
import { cardRoute } from "./routes";

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
