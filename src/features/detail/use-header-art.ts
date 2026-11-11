import { useEffect } from "react";
import type { SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import { backdropWidth, imageUrlFor, POSTER_IMAGE_WIDTH } from "../card-view";
import type { DetailHeaderProps } from "../shared/ui";
import type { ArtSource } from "./art-source";
import { detailArt } from "./detail-art";
import { useCompact } from "./use-compact";

// Sets the page's ambient art and returns the art shown in the flow of the page: the poster beside the text when
// there is no backdrop, or the backdrop itself on compact windows.
export function useHeaderArt(item: ItemDetail, gateway: SessionGateway, onArt: (art: ArtSource | undefined) => void): { inlineArt: DetailHeaderProps["inlineArt"] } {
  const art = detailArt(item);
  const imageUrl = imageUrlFor(gateway);
  const compact = useCompact();
  const artKey = `${item.id}/${art.ambient?.tag ?? "none"}`;
  const { ambient, tint } = art;
  useEffect(() => {
    onArt({ key: artKey, image: ambient, blurHash: tint });
  }, [artKey, ambient, tint, onArt]);

  const inlineArt = art.inlinePoster && item.poster
    ? { src: imageUrl(item.poster, POSTER_IMAGE_WIDTH), ...(item.poster.blurHash ? { blurHash: item.poster.blurHash } : {}), ratio: "2 / 3" as const }
    : ambient && compact
      ? { src: imageUrl(ambient, backdropWidth()), ...(ambient.blurHash ? { blurHash: ambient.blurHash } : {}), ratio: "16 / 9" as const }
      : undefined;
  return { inlineArt };
}
