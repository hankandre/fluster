// Artwork-derived accent (DESIGN.md §3.2). Pure: reads only the BlurHash DC
// term (characters 2-5), so there is no image decoding and no DOM.

export interface ArtTint {
  accent: string;
  glow: string;
  shade: string;
}

export const DEFAULT_ART_TINT: ArtTint = {
  accent: "#e8c48a",
  glow: "rgb(232 196 138 / 0.22)",
  shade: "#141210",
};

const BASE83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
const MIN_CHROMA = 0.02;
const MAX_CHROMA = 0.14;
const MIN_LIGHTNESS = 0.72;
const MAX_LIGHTNESS = 0.82;
const SHADE_LIGHTNESS = 0.16;
const SHADE_MAX_CHROMA = 0.04;
const GLOW_ALPHA = 0.22;

type Rgb = [number, number, number];

// Returns the tint for a BlurHash, or the default for missing, malformed, or
// grey art. Never throws.
export function artTint(blurHash: string | undefined | null): ArtTint {
  try {
    const dc = dcColour(blurHash);
    if (!dc) return DEFAULT_ART_TINT;
    const [lightness, chroma, hue] = toOklch(dc);
    if (!(chroma >= MIN_CHROMA)) return DEFAULT_ART_TINT;
    const accent = fromOklch(Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, lightness)), Math.min(chroma, MAX_CHROMA), hue);
    const shade = fromOklch(SHADE_LIGHTNESS, Math.min(chroma, SHADE_MAX_CHROMA), hue);
    return { accent: hex(accent), glow: `rgb(${accent[0]} ${accent[1]} ${accent[2]} / ${GLOW_ALPHA})`, shade: hex(shade) };
  } catch {
    return DEFAULT_ART_TINT;
  }
}

function dcColour(blurHash: string | undefined | null): Rgb | undefined {
  if (typeof blurHash !== "string" || blurHash.length < 6) return undefined;
  let value = 0;
  for (let index = 2; index < 6; index += 1) {
    const digit = BASE83.indexOf(blurHash.charAt(index));
    if (digit < 0) return undefined;
    value = value * 83 + digit;
  }
  if (value > 0xffffff) return undefined;
  return [value >> 16, (value >> 8) & 255, value & 255];
}

function toLinear(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function toSrgb(linear: number): number {
  const v = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return v * 255;
}

function toOklch([r8, g8, b8]: Rgb): [number, number, number] {
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [lightness, Math.hypot(a, bb), Math.atan2(bb, a)];
}

// Linear sRGB, unclamped, so callers can test gamut.
function oklchToLinear(lightness: number, chroma: number, hue: number): Rgb {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// Keeps lightness and hue; lowers chroma until the colour fits sRGB.
function fromOklch(lightness: number, chroma: number, hue: number): Rgb {
  const inGamut = (c: number) => oklchToLinear(lightness, c, hue).every((v) => v >= -0.0005 && v <= 1.0005);
  let low = 0;
  let high = chroma;
  if (!inGamut(high)) {
    for (let step = 0; step < 20; step += 1) {
      const mid = (low + high) / 2;
      if (inGamut(mid)) low = mid;
      else high = mid;
    }
    high = low;
  }
  return oklchToLinear(lightness, high, hue).map((v) => Math.round(Math.min(255, Math.max(0, toSrgb(Math.min(1, Math.max(0, v))))))) as Rgb;
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
