import type { TrickplayInfo } from "../../domain/catalog";

// Where the thumbnail for a playback time sits: which tile image, and which
// cell of that image.
export interface ThumbnailPlace {
  tileIndex: number;
  column: number;
  row: number;
}

// Undefined when the layout cannot be addressed (zero or negative sizes).
export function thumbnailPlace(info: TrickplayInfo, seconds: number): ThumbnailPlace | undefined {
  const sizes = [info.intervalMs, info.thumbnailCount, info.tileWidth, info.tileHeight];
  if (sizes.some((size) => !(size > 0))) return undefined;
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

// CSS that shows one cell of a tile image. Unscaled, the cell has its own
// size; with `frameWidth` it is scaled to that width, keeping its aspect.
export function thumbnailStyle(info: TrickplayInfo, place: ThumbnailPlace, tileUrl: string | undefined, frameWidth?: number) {
  const scale = frameWidth && frameWidth > 0 && info.width > 0 ? frameWidth / info.width : 1;
  const width = info.width * scale;
  const height = info.height * scale;
  return {
    width,
    height,
    backgroundImage: tileUrl ? `url("${tileUrl}")` : undefined,
    backgroundSize: `${width * info.tileWidth}px ${height * info.tileHeight}px`,
    backgroundPosition: `${-place.column * width}px ${-place.row * height}px`,
  };
}
