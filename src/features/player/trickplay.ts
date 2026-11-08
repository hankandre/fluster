import type { TrickplayInfo } from "../../domain/catalog";

// Where the thumbnail for a playback time sits: which tile image, and which
// cell of that image.
export interface ThumbnailPlace {
  tileIndex: number;
  column: number;
  row: number;
}

export function thumbnailPlace(info: TrickplayInfo, seconds: number): ThumbnailPlace {
  const thumbnailIndex = Math.min(
    Math.max(0, Math.floor((seconds * 1000) / info.intervalMs)),
    info.thumbnailCount - 1,
  );
  const perTile = info.tileWidth * info.tileHeight;
  const withinTile = thumbnailIndex % perTile;
  return {
    tileIndex: Math.floor(thumbnailIndex / perTile),
    column: withinTile % info.tileWidth,
    row: Math.floor(withinTile / info.tileWidth),
  };
}

// CSS that shows one cell of a tile image at the thumbnail's own size.
export function thumbnailStyle(info: TrickplayInfo, place: ThumbnailPlace, tileUrl: string | undefined) {
  return {
    width: info.width,
    height: info.height,
    backgroundImage: tileUrl ? `url("${tileUrl}")` : undefined,
    backgroundSize: `${info.width * info.tileWidth}px ${info.height * info.tileHeight}px`,
    backgroundPosition: `${-place.column * info.width}px ${-place.row * info.height}px`,
  };
}
