import type { ImageRef, ItemDetail } from "../../domain/catalog";

export interface DetailArt {
  // The wide image behind the header: the backdrop, or an episode's still.
  ambient?: ImageRef;
  // The BlurHash the page tint comes from.
  tint?: string;
  // A movie without a backdrop shows its poster beside the text.
  inlinePoster: boolean;
}

export function detailArt(item: ItemDetail): DetailArt {
  const ambient = item.backdrop ?? (item.type === "Episode" ? item.poster : undefined);
  const tint = (ambient ?? item.poster)?.blurHash;
  return {
    ...(ambient ? { ambient } : {}),
    ...(tint ? { tint } : {}),
    inlinePoster: ambient === undefined && item.poster !== undefined,
  };
}
