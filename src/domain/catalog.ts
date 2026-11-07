export interface LibraryItem {
  id: string;
  name: string;
  type: "Movie" | "Episode";
  seriesName?: string;
  season?: number;
  episode?: number;
  productionYear?: number;
  runTimeTicks?: number;
  overview?: string;
  resumePositionTicks: number;
  played: boolean;
}

// Home-screen types. Cards carry only what a row renders.

export type CardImageType = "Primary" | "Backdrop" | "Thumb";

// Identifies one image by item, type, and tag. A tagged image never changes,
// so this is also the cache key.
export interface ImageRef {
  itemId: string;
  type: CardImageType;
  tag: string;
  blurHash?: string;
}

export interface MediaCard {
  id: string;
  title: string;
  subtitle?: string;
  image?: ImageRef;
  // Width divided by height of the image.
  aspectRatio: number;
  // Fraction watched, from 0 to 1. Present only for partly watched items.
  progress?: number;
}

export interface LibraryView {
  id: string;
  name: string;
}
