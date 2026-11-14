// @vitest-environment node
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, decodePng, measureRun, percentile, relativeLuminance, requiredRatio } from "./contrast.mjs";
import { encodePng } from "./generate-visual-art.mjs";

function crcChunk(type: string, data: Buffer): Buffer {


  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
  return out;
}

function png(width: number, height: number, colorType: number, depth: number, interlace: number, raw: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([depth, colorType, 0, 0, interlace], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    crcChunk("IHDR", header),
    crcChunk("IDAT", deflateSync(raw)),
    crcChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("contrast maths", () => {
  it("rates white on black 21 and equal colours 1", () => {
    expect(contrastRatio(relativeLuminance([255, 255, 255]), relativeLuminance([0, 0, 0]))).toBeCloseTo(21, 5);
    expect(contrastRatio(0.3, 0.3)).toBe(1);
  });

  it("rates #767676 on white about 4.54", () => {
    expect(contrastRatio(relativeLuminance([0x76, 0x76, 0x76]), relativeLuminance([255, 255, 255]))).toBeCloseTo(4.54, 2);
  });

  it("composites alpha over a background", () => {
    const mixed = composite([255, 255, 255], 0.5, [0, 0, 0]);
    expect(mixed[0]).toBeGreaterThanOrEqual(127);
    expect(mixed[0]).toBeLessThanOrEqual(128);
    expect(composite([10, 20, 30], 1, [200, 200, 200])).toEqual([10, 20, 30]);
  });

  it("applies the thresholds of DESIGN.md 11", () => {
    expect(requiredRatio(24, 400)).toBe(3);
    expect(requiredRatio(23.9, 400)).toBe(4.5);
    expect(requiredRatio(18.66, 700)).toBe(3);
    expect(requiredRatio(18.66, 600)).toBe(4.5);
  });

  it("takes percentiles between ranks", () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
    expect(percentile([10, 20], 25)).toBe(12.5);
  });
});

describe("measureRun", () => {
  it("reports the 5th percentile and the lowest ratio over a half white, half black background", () => {
    const width = 10;
    const height = 2;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const v = x < 5 ? 255 : 0;
        pixels.set([v, v, v, 255], i);
      }
    }
    const result = measureRun(pixels, width, { x: 0, y: 0, width: 10, height: 2 }, [255, 255, 255], 1);
    expect(result.lowest).toBe(1);
    expect(result.ratio).toBe(1);
    const dark = measureRun(pixels, width, { x: 5, y: 0, width: 5, height: 2 }, [255, 255, 255], 1);
    expect(dark).toEqual({ ratio: 21, lowest: 21 });
  });

  it("clamps the rect to the image", () => {
    const pixels = Buffer.alloc(4 * 4 * 4, 0);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    const result = measureRun(pixels, 4, { x: -5, y: -5, width: 100, height: 100 }, [255, 255, 255], 1);
    expect(result.ratio).toBe(21);
  });
});

describe("decodePng", () => {
  it("round-trips encodePng output", () => {
    const rgba = Buffer.from([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 200, 10, 11, 12, 100]);
    const decoded = decodePng(encodePng(2, 2, rgba));
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect([...decoded.rgba]).toEqual([...rgba]);
  });

  it("undoes filter types 1 to 4", () => {
    // Two RGBA pixels per row, four rows; each row uses a different filter.
    const rows = [
      [10, 20, 30, 255, 40, 50, 60, 255],
      [11, 21, 31, 255, 41, 51, 61, 255],
      [12, 22, 32, 255, 42, 52, 62, 255],
      [13, 23, 33, 255, 43, 53, 63, 255],
    ];
    const bpp = 4;
    const paeth = (a: number, b: number, c: number) => {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    const lines: number[] = [];
    rows.forEach((row, y) => {
      const filter = y + 1;
      lines.push(filter);
      row.forEach((value, i) => {
        const left = i >= bpp ? row[i - bpp] : 0;
        const up = y > 0 ? rows[y - 1][i] : 0;
        const upLeft = y > 0 && i >= bpp ? rows[y - 1][i - bpp] : 0;
        const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
        lines.push((value - predictor) & 0xff);
      });
    });
    const decoded = decodePng(png(2, 4, 6, 8, 0, Buffer.from(lines)));
    expect([...decoded.rgba]).toEqual(rows.flat());
  });

  it("expands colour type 2 to opaque RGBA", () => {
    const raw = Buffer.from([0, 9, 8, 7, 6, 5, 4]);
    const decoded = decodePng(png(2, 1, 2, 8, 0, raw));
    expect([...decoded.rgba]).toEqual([9, 8, 7, 255, 6, 5, 4, 255]);
  });

  it("throws on interlaced and 16-bit images", () => {
    expect(() => decodePng(png(1, 1, 6, 8, 1, Buffer.from([0, 0, 0, 0, 0])))).toThrow(/interlaced/);
    expect(() => decodePng(png(1, 1, 6, 16, 0, Buffer.alloc(9)))).toThrow(/bit depth/);
    expect(() => decodePng(Buffer.from("nope"))).toThrow(/not a PNG/);
  });
});
