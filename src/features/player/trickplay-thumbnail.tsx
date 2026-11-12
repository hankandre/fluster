import { useEffect, useState } from "react";
import type { TrickplayInfo } from "../../domain/catalog";
import { thumbnailPlace, thumbnailStyle } from "./trickplay";
import type { TileCache } from "./tile-cache";

// The preview picture for one playback time. The image appears once its tile
// has loaded.
export function TrickplayThumbnail({ info, cache, seconds, label, frameWidth }: {
  info: TrickplayInfo;
  cache: TileCache;
  seconds: number;
  label: string;
  // Scales the picture to the frame it sits in; absent, it keeps the tile's own size.
  frameWidth?: number;
}) {
  const place = thumbnailPlace(info, seconds);
  const [loaded, setLoaded] = useState<{ index: number; url: string }>();

  const tileIndex = place?.tileIndex;

  useEffect(() => {
    if (tileIndex === undefined) return;
    let current = true;
    void cache.load(tileIndex).then((url) => {
      if (current && url) setLoaded({ index: tileIndex, url });
    });
    return () => {
      current = false;
    };
  }, [cache, tileIndex]);

  if (!place) return null;
  const url = cache.peek(place.tileIndex) ?? (loaded?.index === place.tileIndex ? loaded.url : undefined);
  return <div className="seek-thumbnail" role="img" aria-label={label} style={thumbnailStyle(info, place, url, frameWidth)} />;
}
