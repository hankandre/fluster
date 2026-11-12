import { describe, expect, it } from "vitest";
import type { TrickplayInfo } from "../../domain/catalog";
import { thumbnailPlace, thumbnailStyle } from "./trickplay";

// 10 s apart, 5 columns by 2 rows per tile, 12 thumbnails in all.
const info: TrickplayInfo = { width: 320, height: 180, tileWidth: 5, tileHeight: 2, thumbnailCount: 12, intervalMs: 10_000 };

describe("thumbnailPlace", () => {
  it.each([
    [0, 0, 0, 0],
    [9.9, 0, 0, 0],
    [10, 0, 1, 0],
    [49, 0, 4, 0],
    [50, 0, 0, 1],
    [95, 0, 4, 1],
    [100, 1, 0, 0],
    [115, 1, 1, 0],
  ])("%d s is tile %d, column %d, row %d", (seconds, tileIndex, column, row) => {
    expect(thumbnailPlace(info, seconds)).toEqual({ tileIndex, column, row });
  });

  it.each([
    ["interval", { intervalMs: 0 }],
    ["thumbnail count", { thumbnailCount: 0 }],
    ["tile width", { tileWidth: 0 }],
    ["tile height", { tileHeight: -1 }],
  ])("returns no place for a zero or negative %s", (_name, change) => {
    expect(thumbnailPlace({ ...info, ...change }, 30)).toBeUndefined();
  });

  it("clamps to the first and last thumbnail", () => {
    expect(thumbnailPlace(info, -5)).toEqual({ tileIndex: 0, column: 0, row: 0 });
    expect(thumbnailPlace(info, 99999)).toEqual({ tileIndex: 1, column: 1, row: 0 });
  });
});

describe("thumbnailStyle", () => {
  it("shows one cell of the tile at thumbnail size", () => {
    const style = thumbnailStyle(info, { tileIndex: 0, column: 2, row: 1 }, "blob:x");
    expect(style).toEqual({
      width: 320,
      height: 180,
      backgroundImage: 'url("blob:x")',
      backgroundSize: "1600px 360px",
      backgroundPosition: "-640px -180px",
    });
  });

  it("scales the cell, the tile, and the offset to the frame width", () => {
    const style = thumbnailStyle(info, { tileIndex: 0, column: 2, row: 1 }, "blob:x", 160);
    expect(style).toEqual({
      width: 160,
      height: 90,
      backgroundImage: 'url("blob:x")',
      backgroundSize: "800px 180px",
      backgroundPosition: "-320px -90px",
    });
  });

  it("stays unscaled for a frame width of zero", () => {
    expect(thumbnailStyle(info, { tileIndex: 0, column: 0, row: 0 }, "blob:x", 0).width).toBe(320);
  });

  it("has no image before the tile loads", () => {
    expect(thumbnailStyle(info, { tileIndex: 0, column: 0, row: 0 }, undefined).backgroundImage).toBeUndefined();
  });
});
