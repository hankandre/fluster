import { useState } from "react";
import type { ImageRef } from "../../domain/catalog";
import { blurhashToDataUrl } from "./blurhash";

export const CARD_IMAGE_WIDTH = 320;

// Shows the blurhash (or a neutral block) until the real image has loaded.
export function CardImage({ image, src }: { image: ImageRef | undefined; src: string | undefined }) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = image?.blurHash ? blurhashToDataUrl(image.blurHash) : undefined;

  return (
    <div
      className="card-image"
      data-testid="card-image"
      data-state={loaded ? "loaded" : "loading"}
      data-placeholder={placeholder ? "blurhash" : "neutral"}
      style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      ) : null}
    </div>
  );
}
