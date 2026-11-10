import { useState } from "react";
import { blurhashToDataUrl } from "../../home/blurhash";

interface CardImageProps {
  image: { blurHash?: string } | undefined;
  src: string | undefined;
  // When set, a missing or failed image shows this title on a neutral block.
  fallbackTitle?: string;
}

// Shows the blurhash (or a neutral block) until the real image has loaded.
export function CardImage({ image, src, fallbackTitle }: CardImageProps) {
  const [result, setResult] = useState<{ src: string; state: "loaded" | "error" } | undefined>();
  const placeholder = image?.blurHash ? blurhashToDataUrl(image.blurHash) : undefined;
  const state = src && result?.src === src ? result.state : "loading";
  const showTitle = fallbackTitle !== undefined && (state === "error" || (!src && !placeholder));

  return (
    <div
      className="card-image"
      data-testid="card-image"
      data-state={state}
      data-placeholder={placeholder ? "blurhash" : "neutral"}
      style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}
    >
      {src && state !== "error" ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setResult({ src, state: "loaded" })}
          onError={() => setResult({ src, state: "error" })}
        />
      ) : null}
      {showTitle ? <span className="card-image-fallback">{fallbackTitle}</span> : null}
    </div>
  );
}
