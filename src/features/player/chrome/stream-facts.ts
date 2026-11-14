import type { AudioFacts, PlaybackDiagnostics, VideoFacts } from "../../../domain/playback";
import { channelLabel, codecName } from "../../detail/format";

// Labels for the Info sheet's Video and Audio sections. Each returns undefined
// when the engine did not report the fact; the sheet shows "Unknown" then.
// Callers pass the result through the sheet's redaction.

export function videoCodecLabel(video: VideoFacts | undefined): string | undefined {
  return codecName(video?.codec);
}

export function resolutionLabel(diagnostics: PlaybackDiagnostics | undefined): string | undefined {
  if (!diagnostics?.width || !diagnostics.height) return undefined;
  return `${diagnostics.width}×${diagnostics.height}`;
}

export function rangeLabel(video: VideoFacts | undefined, bitDepth: number | undefined): string | undefined {
  let label: string | undefined;
  switch (video?.range) {
    case "sdr":
      label = "SDR";
      break;
    case "pq":
      label = "HDR (PQ)";
      break;
    case "hlg":
      label = "HDR (HLG)";
      break;
    case "dolby-vision":
      label = video.dolbyVisionProfile ? `Dolby Vision, profile ${video.dolbyVisionProfile}` : "Dolby Vision";
      break;
    default:
      return undefined;
  }
  return bitDepth ? `${label} · ${bitDepth}-bit` : label;
}

export function audioCodecLabel(audio: AudioFacts | undefined): string | undefined {
  return codecName(audio?.codec);
}

export function channelsLabel(audio: AudioFacts | undefined): string | undefined {
  const channels = channelLabel(audio?.channelCount);
  if (!channels) return undefined;
  if (!audio?.sampleRate) return channels;
  return `${channels} · ${Number((audio.sampleRate / 1000).toFixed(1))} kHz`;
}

const PASSTHROUGH = "spdif-";

export function audioOutputLabel(audio: AudioFacts | undefined): string | undefined {
  const format = audio?.outputFormat;
  if (!format) return undefined;
  if (format.startsWith(PASSTHROUGH)) {
    return `Passthrough (${codecName(format.slice(PASSTHROUGH.length)) ?? "unknown"})`;
  }
  const channels = channelLabel(audio.outputChannelCount);
  return channels ? `PCM, ${channels}` : "PCM";
}
