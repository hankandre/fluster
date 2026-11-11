import { decode } from "blurhash";

const PLACEHOLDER_SIZE = 32;
const cache = new Map<string, string | undefined>();

// Decodes a blurhash into a small PNG data URL, or undefined when the hash is
// invalid or canvas is unavailable. Results are cached because hashes repeat.
export function blurhashToDataUrl(hash: string): string | undefined {
  if (cache.has(hash)) return cache.get(hash);
  const url = decodeToDataUrl(hash);
  cache.set(hash, url);
  return url;
}

function decodeToDataUrl(hash: string): string | undefined {
  try {
    const pixels = decode(hash, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
    const canvas = document.createElement("canvas");
    canvas.width = PLACEHOLDER_SIZE;
    canvas.height = PLACEHOLDER_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), PLACEHOLDER_SIZE, PLACEHOLDER_SIZE), 0, 0);
    return canvas.toDataURL();
  } catch {
    return undefined;
  }
}
