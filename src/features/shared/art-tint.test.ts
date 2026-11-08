import { describe, expect, it } from "vitest";
import { artTint, DEFAULT_ART_TINT } from "./art-tint";

const BASE83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";

function encode(r: number, g: number, b: number): string {
  let value = (r << 16) | (g << 8) | b;
  let digits = "";
  for (let i = 0; i < 4; i += 1) {
    digits = BASE83[value % 83] + digits;
    value = Math.floor(value / 83);
  }
  return `L0${digits}xxxxxxxxxxxxxxxxxxxx`;
}

function luminance(hexColour: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = parseInt(hexColour.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastOnSurface(hexColour: string): number {
  const surface = luminance("#0b0c0e");
  const l = luminance(hexColour);
  return (Math.max(l, surface) + 0.05) / (Math.min(l, surface) + 0.05);
}

// Deterministic generator so failures reproduce.
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("artTint", () => {
  it("returns the default for missing, short, malformed, and grey hashes", () => {
    for (const hash of [undefined, null, "", "L", "LEHV6", "LE!!!!xxxxxx", encode(128, 128, 128), encode(0, 0, 0), encode(255, 255, 255)]) {
      expect(artTint(hash as string | undefined)).toEqual(DEFAULT_ART_TINT);
    }
  });

  it("decodes the DC term per the BlurHash spec", () => {
    // "00L-|1": base83 L,-,|,1 = (190, 120, 60). The spec demo hash decodes to (151, 150, 149), which is grey.
    expect(artTint("00L-|1")).not.toEqual(DEFAULT_ART_TINT);
    expect(artTint("00L-|1")).toEqual(artTint(encode(190, 120, 60).replace(/^L0/, "00").slice(0, 6)));
    expect(artTint("LEHV6nWB2yk8pyo0adR*.7kCMdnj")).toEqual(DEFAULT_ART_TINT);
  });

  it("matches the default accent contrast documented in DESIGN.md", () => {
    expect(contrastOnSurface(DEFAULT_ART_TINT.accent)).toBeGreaterThan(11);
  });

  it("derives a tinted accent, glow at 22% alpha, and a dark shade from the DC term", () => {
    const tint = artTint(encode(200, 60, 40));
    expect(tint.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(tint.accent).not.toBe(DEFAULT_ART_TINT.accent);
    expect(tint.glow).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.22\)$/);
    expect(luminance(tint.shade)).toBeLessThan(0.02);
    // Red art stays warm: red channel dominates.
    expect(parseInt(tint.accent.slice(1, 3), 16)).toBeGreaterThan(parseInt(tint.accent.slice(5, 7), 16));
  });

  it("keeps the accent at 3:1 or more against --surface-0 for any input", () => {
    const random = lcg(42);
    const alphabet = BASE83 + " é\u{1f600}";
    for (let i = 0; i < 3000; i += 1) {
      const hash = i % 2 === 0
        ? encode(Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256))
        : Array.from({ length: Math.floor(random() * 30) }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
      const tint = artTint(hash);
      expect(contrastOnSurface(tint.accent), hash).toBeGreaterThanOrEqual(3);
    }
  });

  it("covers the whole RGB cube coarsely", () => {
    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          expect(contrastOnSurface(artTint(encode(r, g, b)).accent)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("never throws on non-string input", () => {
    for (const value of [42, {}, [], NaN]) expect(() => artTint(value as unknown as string)).not.toThrow();
  });
});
