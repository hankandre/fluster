// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { decodePng, relativeLuminance } from "./contrast.mjs";
import { generateArt } from "./generate-visual-art.mjs";

const first = mkdtempSync(join(tmpdir(), "fluster-art-a-"));
const second = mkdtempSync(join(tmpdir(), "fluster-art-b-"));
afterAll(() => {
  rmSync(first, { recursive: true, force: true });
  rmSync(second, { recursive: true, force: true });
});

const sizes = { "worst-backdrop": [1920, 1080], "worst-poster": [400, 600], "worst-still": [1280, 720] } as const;

describe("worst-case art", () => {
  generateArt(first);
  generateArt(second);

  it.each(Object.entries(sizes))("writes %s at its size", (name, [width, height]) => {
    const image = decodePng(readFileSync(join(first, `${name}.png`)));
    expect([image.width, image.height]).toEqual([width, height]);
  });

  it("is deterministic", () => {
    for (const name of Object.keys(sizes)) {
      expect(readFileSync(join(first, `${name}.png`)).equals(readFileSync(join(second, `${name}.png`)))).toBe(true);
    }
  });

  it.each(Object.keys(sizes))("%s is bright, high-contrast and busy", { timeout: 60_000 }, (name) => {
    const { width, height, rgba } = decodePng(readFileSync(join(first, `${name}.png`)));
    const lutChannel = (v: number) => lut[v];
    const lut = Array.from({ length: 256 }, (_, v) => relativeLuminance([v, v, v]));
    const lum = new Float64Array(width * height);
    let sum = 0;
    let dark = 0;
    for (let p = 0; p < lum.length; p += 1) {
      // Channel-wise luminance is linear in the linearised channels, so sum the three weighted lookups.
      lum[p] = 0.2126 * lutChannel(rgba[p * 4]) + 0.7152 * lutChannel(rgba[p * 4 + 1]) + 0.0722 * lutChannel(rgba[p * 4 + 2]);
      sum += lum[p];
      if (lum[p] <= 0.05) dark += 1;
      expect(rgba[p * 4 + 3]).toBe(255);
    }
    expect(sum / lum.length).toBeGreaterThanOrEqual(0.6);
    expect(dark / lum.length).toBeGreaterThanOrEqual(0.01);
    for (let ty = 0; ty + 64 <= height; ty += 64) {
      for (let tx = 0; tx + 64 <= width; tx += 64) {
        let lo = 1;
        let hi = 0;
        for (let y = ty; y < ty + 64; y += 1) {
          for (let x = tx; x < tx + 64; x += 1) {
            const v = lum[y * width + x];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        expect(hi - lo, `${name} tile ${tx},${ty}`).toBeGreaterThanOrEqual(0.5);
      }
    }
  });
});
