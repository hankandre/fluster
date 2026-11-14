// Generates deterministic synthetic art (gradients and soft shapes) for the
// visual screenshot harness. Node only; no image tools and no real artwork.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const artDir = join(root, "e2e", "fixtures", "art");

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
  return out;
}

export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a + (b - a) * t;

// A diagonal gradient from `from` to `to` with soft circular glows.
function paint(width, height, { from, to, glows = [], alpha = () => 255 }) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      const rgb = [mix(from[0], to[0], t), mix(from[1], to[1], t), mix(from[2], to[2], t)];
      for (const glow of glows) {
        const dx = x / width - glow.x;
        const dy = (y / height - glow.y) * (height / width);
        const k = Math.max(0, 1 - Math.hypot(dx, dy) / glow.r) ** 2 * glow.strength;
        for (let c = 0; c < 3; c += 1) rgb[c] = mix(rgb[c], glow.color[c], k);
      }
      const i = (y * width + x) * 4;
      pixels[i] = rgb[0];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[2];
      pixels[i + 3] = alpha(x, y);
    }
  }
  return pixels;
}

const palettes = [
  { from: [20, 38, 64], to: [214, 120, 62], glow: [250, 214, 150] },
  { from: [34, 18, 52], to: [190, 70, 110], glow: [255, 170, 190] },
  { from: [14, 52, 48], to: [96, 176, 140], glow: [220, 250, 200] },
  { from: [58, 30, 18], to: [220, 170, 70], glow: [255, 240, 190] },
  { from: [18, 22, 40], to: [90, 110, 200], glow: [200, 220, 255] },
  { from: [40, 40, 44], to: [170, 164, 150], glow: [255, 250, 240] },
];

function art(width, height, index) {
  const p = palettes[index % palettes.length];
  return paint(width, height, {
    from: p.from,
    to: p.to,
    glows: [
      { x: 0.3 + 0.1 * (index % 3), y: 0.35, r: 0.55, strength: 0.7, color: p.glow },
      { x: 0.8, y: 0.8, r: 0.4, strength: 0.4, color: p.to },
    ],
  });
}

// A strip of 5x2 tiles of 320x180, each a different shade, like a trickplay sheet.
function trickplay() {
  const width = 1600;
  const height = 360;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = Math.floor(y / 180) * 5 + Math.floor(x / 320);
      const p = palettes[tile % palettes.length];
      const t = (x % 320) / 320;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) pixels[i + c] = mix(p.from[c], p.to[c], t);
      pixels[i + 3] = 255;
    }
  }
  return encodePng(width, height, pixels);
}

// A soft white wordmark-like pill on transparency, standing in for a Logo image.
function logo() {
  const width = 600;
  const height = 200;
  const pixels = paint(width, height, {
    from: [245, 245, 245],
    to: [210, 210, 210],
    alpha: (x, y) => {
      const dx = Math.max(0, Math.abs(x - width / 2) - (width / 2 - 100));
      const dy = y - height / 2;
      return Math.hypot(dx, dy) < 70 && (x % 120 > 20) ? 255 : 0;
    },
  });
  return encodePng(width, height, pixels);
}

// 32-bit integer hash of a cell, for scatter that needs no Math.random.
function hash(a, b) {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) | 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

const baseBands = [[255, 252, 214], [214, 252, 255], [255, 222, 240], [255, 255, 236], [226, 255, 250]];
const blockColors = [[255, 235, 59], [0, 229, 255], [178, 255, 89]];

// Bright, high-contrast, busy art: pale bands, saturated blocks, black hatching and black and white specks.
// A pure function of (x, y), fully opaque. Used to check text legibility on the worst artwork.
function worstArt(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const band = baseBands[(Math.floor((x + 2 * y) / (40 + (hash(Math.floor((x + 2 * y) / 80), 1) % 80))) + hash(0, 7)) % baseBands.length];
      let rgb = band;
      const bx = Math.floor(x / 48);
      const by = Math.floor(y / 48);
      const cell = hash(bx, by);
      if (cell % 3 !== 0) {
        const size = 24 + (cell % 73);
        if ((x % 48) < Math.min(48, size) && (y % 48) < Math.min(48, size)) rgb = blockColors[(cell >>> 8) % blockColors.length];
      }
      const pitch = 14 + (hash(Math.floor(y / 90), 3) % 17);
      if (((x + y) % pitch) < 2) rgb = [0, 0, 0];
      const speck = hash(Math.floor(x / 6), Math.floor(y / 6));
      if (speck % 100 < 4) rgb = speck % 2 === 0 ? [0, 0, 0] : [255, 255, 255];
      const i = (y * width + x) * 4;
      pixels[i] = rgb[0];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[2];
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

export function generateArt(dir = artDir) {
  mkdirSync(dir, { recursive: true });
  const files = {};
  for (let i = 0; i < 6; i += 1) files[`p${i + 1}`] = encodePng(400, 600, art(400, 600, i));
  for (let i = 0; i < 3; i += 1) files[`b${i + 1}`] = encodePng(1280, 720, art(1280, 720, i + 2));
  for (let i = 0; i < 2; i += 1) files[`t${i + 1}`] = encodePng(640, 360, art(640, 360, i + 4));
  files.trick = trickplay();
  files.logo = logo();
  files.frame = encodePng(1920, 1080, art(1920, 1080, 4));
  files["worst-backdrop"] = encodePng(1920, 1080, worstArt(1920, 1080));
  files["worst-poster"] = encodePng(400, 600, worstArt(400, 600));
  files["worst-still"] = encodePng(1280, 720, worstArt(1280, 720));
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, `${name}.png`), data);
  return Object.keys(files);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`generated ${generateArt().length} images in ${artDir}`);
}
