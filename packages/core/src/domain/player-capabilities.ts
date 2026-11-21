import {
  AUDIO_CODECS,
  HDR_TYPES,
  PASSTHROUGH_FORMATS,
  VIDEO_CODECS,
  type PlayerCapabilities,
  type VideoDecoder,
} from "./player-engine";

const PROFILE = /^[A-Za-z0-9 .+-]{1,32}$/;
const BIT_DEPTHS: readonly unknown[] = [8, 10, 12];

// Reads an engine's capability answer (T2-05). Only known codecs, HDR types and passthrough formats cross;
// anything the engine could not read, or a shape that is not a capability list, is "cannot tell".
export function readCapabilities(raw: unknown): PlayerCapabilities {
  if (!isRecord(raw) || raw.probe !== "complete") return { probe: "failed" };
  const { videoDecoders, audioDecoders, hdr, passthrough } = raw;
  if (!Array.isArray(videoDecoders) || !Array.isArray(audioDecoders) || !Array.isArray(hdr) || !Array.isArray(passthrough)) {
    return { probe: "failed" };
  }
  return {
    probe: "complete",
    videoDecoders: uniqueDecoders(videoDecoders),
    audioDecoders: known(audioDecoders, AUDIO_CODECS),
    hdr: known(hdr, HDR_TYPES),
    passthrough: known(passthrough, PASSTHROUGH_FORMATS),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function known<T extends string>(values: readonly unknown[], allowed: readonly T[]): T[] {
  const kept: T[] = [];
  for (const value of values) {
    if ((allowed as readonly unknown[]).includes(value) && !kept.includes(value as T)) kept.push(value as T);
  }
  return kept;
}

function uniqueDecoders(values: readonly unknown[]): VideoDecoder[] {
  const kept: VideoDecoder[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const decoder = readDecoder(value);
    if (!decoder) continue;
    const key = JSON.stringify([decoder.codec, decoder.hardware, decoder.profile, decoder.maxBitDepth, decoder.maxWidth, decoder.maxHeight]);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(decoder);
  }
  return kept;
}

function readDecoder(value: unknown): VideoDecoder | undefined {
  if (!isRecord(value)) return undefined;
  const codec = (VIDEO_CODECS as readonly unknown[]).includes(value.codec) ? (value.codec as VideoDecoder["codec"]) : undefined;
  if (!codec || typeof value.hardware !== "boolean") return undefined;
  const decoder: VideoDecoder = { codec, hardware: value.hardware };
  if (typeof value.profile === "string" && PROFILE.test(value.profile)) decoder.profile = value.profile;
  if (BIT_DEPTHS.includes(value.maxBitDepth)) decoder.maxBitDepth = value.maxBitDepth as 8 | 10 | 12;
  if (isPositiveInteger(value.maxWidth)) decoder.maxWidth = value.maxWidth;
  if (isPositiveInteger(value.maxHeight)) decoder.maxHeight = value.maxHeight;
  return decoder;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
