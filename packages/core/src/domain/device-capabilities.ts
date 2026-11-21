// What the device can play, read against one source's judged streams (T2-07, ARCHITECTURE.md §3 rule 3). Pure: it
// takes a plain SourceFormat, so no server DTO reaches the domain.
import type { AudioCodec, PassthroughFormat, PlayerCapabilities, VideoCodec } from "./player-engine";

// "full" is a negotiation-side value: the host states no device limit, so every source is playable. An engine cannot
// report it.
export type DeviceCapabilities = "full" | PlayerCapabilities;

export interface SourceFormat {
  video?: { codec?: string; profile?: string; bitDepth?: number; width?: number; height?: number };
  audio?: { codec?: string };
}

export interface Playability {
  video: boolean;
  audio: boolean;
}

// The audio codecs a passthrough format lets the device play without a decoder (decision 0003, item 2).
const PASSTHROUGH_FOR: Readonly<Record<string, readonly PassthroughFormat[]>> = {
  ac3: ["ac3"],
  eac3: ["eac3", "eac3-joc"],
  dts: ["dts", "dts-hd"],
  truehd: ["truehd"],
};

// A limit the decoder states needs a value the source gives, and not above it.
function within(limit: number | undefined, actual: number | undefined): boolean {
  if (limit === undefined) return true;
  return typeof actual === "number" && actual <= limit;
}

export function devicePlayability(format: SourceFormat, capabilities: DeviceCapabilities): Playability {
  if (capabilities === "full") return { video: true, audio: true };
  if (capabilities.probe !== "complete") return { video: false, audio: false };
  // A source with neither stream gives nothing to judge.
  if (!format.video && !format.audio) return { video: false, audio: false };
  return {
    video: format.video ? videoPlayable(format.video, capabilities) : true,
    audio: format.audio ? audioPlayable(format.audio.codec, capabilities) : true,
  };
}

function videoPlayable(video: NonNullable<SourceFormat["video"]>, capabilities: Extract<PlayerCapabilities, { probe: "complete" }>): boolean {
  const codec = video.codec?.toLowerCase();
  if (!codec) return false;
  const profile = video.profile?.trim().toLowerCase();
  return capabilities.videoDecoders.some((decoder) => {
    if (decoder.codec !== (codec as VideoCodec)) return false;
    if (decoder.profile !== undefined && decoder.profile.trim().toLowerCase() !== profile) return false;
    return within(decoder.maxBitDepth, video.bitDepth)
      && within(decoder.maxWidth, video.width)
      && within(decoder.maxHeight, video.height);
  });
}

function audioPlayable(codecName: string | undefined, capabilities: Extract<PlayerCapabilities, { probe: "complete" }>): boolean {
  const codec = codecName?.toLowerCase();
  if (!codec) return false;
  if (capabilities.audioDecoders.includes(codec as AudioCodec)) return true;
  return (PASSTHROUGH_FOR[codec] ?? []).some((format) => capabilities.passthrough.includes(format));
}
