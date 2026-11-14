// Pure contrast helpers for the worst-case artwork captures (WCAG 2.2 maths and a small PNG decoder).
import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Decodes an 8-bit, non-interlaced RGB or RGBA PNG into { width, height, rgba }.
export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("decodePng: not a PNG");
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  if (!header) throw new Error("decodePng: missing IHDR");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colorType = header[9];
  const interlace = header[12];
  if (depth !== 8) throw new Error(`decodePng: unsupported bit depth ${depth}`);
  if (interlace !== 0) throw new Error("decodePng: interlaced PNG is not supported");
  if (colorType !== 2 && colorType !== 6) throw new Error(`decodePng: unsupported colour type ${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error("decodePng: unexpected data length");
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bpp ? out[dst + i - bpp] : 0;
      const up = y > 0 ? out[dst - stride + i] : 0;
      const upLeft = y > 0 && i >= bpp ? out[dst - stride + i - bpp] : 0;
      let predictor;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = left; break;
        case 2: predictor = up; break;
        case 3: predictor = (left + up) >> 1; break;
        case 4: predictor = paeth(left, up, upLeft); break;
        default: throw new Error(`decodePng: unknown filter ${filter}`);
      }
      out[dst + i] = (raw[src + i] + predictor) & 0xff;
    }
  }
  if (bpp === 4) return { width, height, rgba: out };
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    rgba[p * 4] = out[p * 3];
    rgba[p * 4 + 1] = out[p * 3 + 1];
    rgba[p * 4 + 2] = out[p * 3 + 2];
    rgba[p * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

const linear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance([r, g, b]) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function composite(fg, alpha, bg) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}

// DESIGN.md 11 rule 1: 3:1 for 24 px and up or 18.66 px bold and up, otherwise 4.5:1.
export function requiredRatio(fontSizePx, fontWeight) {
  if (fontSizePx >= 24) return 3;
  if (fontSizePx >= 18.66 && fontWeight >= 700) return 3;
  return 4.5;
}

// Linear interpolation between closest ranks.
export function percentile(values, p) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

const round2 = (value) => Math.round(value * 100) / 100;

// The contrast of text (colour fg at alpha) against each background pixel in rect; the reported ratio is the 5th percentile.
export function measureRun(pixels, width, rect, fg, alpha) {
  const height = Math.floor(pixels.length / 4 / width);
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(width, Math.round(rect.x + rect.width));
  const y1 = Math.min(height, Math.round(rect.y + rect.height));
  const ratios = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      const bg = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const text = composite(fg, alpha, bg);
      ratios.push(contrastRatio(relativeLuminance(text), relativeLuminance(bg)));
    }
  }
  if (ratios.length === 0) return { ratio: NaN, lowest: NaN };
  return { ratio: round2(percentile(ratios, 5)), lowest: round2(Math.min(...ratios)) };
}
