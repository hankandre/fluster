// Generates synthetic, copyright-free art for the browse falsifier with ImageMagick.
// Posters: 2:3 at 1000x1500 (source) and 300x450 (what the app requests, per Google's TV
// memory guidance to load images at UI size). Backdrops: 1920x1080.
// Output: ./art (gitignored). Usage: node scripts/generate-art.mjs [posterCount] [backdropCount]
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "art");
const posters = Number(process.argv[2] ?? 400);
const backdrops = Number(process.argv[3] ?? 60);
for (const d of ["poster/1000", "poster/300", "backdrop/1920"]) mkdirSync(join(out, d), { recursive: true });

// Deterministic pseudo-random colours from the index.
function hsl(seed, s, l) {
  const h = (seed * 137.508) % 360;
  return `hsl(${h.toFixed(1)},${s}%,${l}%)`;
}

async function poster(i) {
  const src = join(out, "poster/1000", `${i}.jpg`);
  await run("magick", [
    "-size", "1000x1500", `gradient:${hsl(i, 55, 18)}-${hsl(i + 3, 65, 52)}`,
    "(", "-size", "1000x1500", "radial-gradient:white-black", "-evaluate", "pow", "2", "-evaluate", "multiply", "0.45", ")",
    "-compose", "screen", "-composite",
    "-attenuate", "0.6", "+noise", "Gaussian",
    "-fill", "rgba(242,239,233,0.92)", "-pointsize", "150",
    "-gravity", "south", "-annotate", "+0+180", `#${i}`,
    "-pointsize", "60", "-annotate", "+0+90", "SYNTHETIC",
    "-quality", "85", src,
  ]);
  await run("magick", [src, "-resize", "300x450", "-quality", "82", join(out, "poster/300", `${i}.jpg`)]);
}

async function backdrop(i) {
  await run("magick", [
    "-size", "1920x1080", `gradient:${hsl(i * 7, 50, 10)}-${hsl(i * 7 + 2, 60, 45)}`,
    "-virtual-pixel", "mirror", "-distort", "SRT", String((i * 37) % 360),
    "(", "-size", "1920x1080", "radial-gradient:white-black", "-evaluate", "pow", "3", "-evaluate", "multiply", "0.5", ")",
    "-compose", "screen", "-composite",
    "-attenuate", "0.5", "+noise", "Gaussian",
    "-quality", "85", join(out, "backdrop/1920", `${i}.jpg`),
  ]);
}

const jobs = [];
for (let i = 0; i < posters; i += 1) jobs.push(() => poster(i));
for (let i = 0; i < backdrops; i += 1) jobs.push(() => backdrop(i));
const width = Math.max(2, cpus().length - 2);
let next = 0;
await Promise.all(Array.from({ length: width }, async () => {
  while (next < jobs.length) await jobs[next++]();
}));
console.log(`wrote ${posters} posters (1000 and 300 px) and ${backdrops} backdrops to ${out}`);
