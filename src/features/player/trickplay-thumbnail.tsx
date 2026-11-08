import { useEffect, useState } from "react";
import type { TrickplayInfo } from "../../domain/catalog";
import { thumbnailPlace, thumbnailStyle } from "./trickplay";
import type { TileCache } from "./tile-cache";

// The preview picture for one playback time. The image appears once its tile
// has loaded.
export function TrickplayThumbnail({ info, cache, seconds, label }: {
  info: TrickplayInfo;
  cache: TileCache;
  seconds: number;
  label: string;
}) {
  const place = thumbnailPlace(info, seconds);
  const [loaded, setLoaded] = useState<{ index: number; url: string }>();

  useEffect(() => {
    let current = true;
    void cache.load(place.tileIndex).then((url) => {
      if (current && url) setLoaded({ index: place.tileIndex, url });
    });
    return () => {
      current = false;
    };
  }, [cache, place.tileIndex]);

  const url = cache.peek(place.tileIndex) ?? (loaded?.index === place.tileIndex ? loaded.url : undefined);
  return <div className="seek-thumbnail" role="img" aria-label={label} style={thumbnailStyle(info, place, url)} />;
}
