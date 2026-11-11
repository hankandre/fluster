import type { ImageRef } from "../../domain/catalog";

// What the ambient backdrop shows: the wide image, tinted from its BlurHash (else the poster's).
export interface ArtSource {
  key: string;
  image: ImageRef | undefined;
  blurHash: string | undefined;
}
