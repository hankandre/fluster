import type { AudioInfo, SubtitleInfo, VideoInfo } from "../../domain/catalog";

const TICKS_PER_MINUTE = 600_000_000;

const CODEC_NAMES: Record<string, string> = {
  h264: "H.264",
  hevc: "HEVC",
  av1: "AV1",
  vp9: "VP9",
  mpeg2video: "MPEG-2",
  aac: "AAC",
  ac3: "AC-3",
  eac3: "E-AC-3",
  truehd: "TrueHD",
  dts: "DTS",
  flac: "FLAC",
  opus: "Opus",
  mp3: "MP3",
  subrip: "SRT",
  srt: "SRT",
  ass: "ASS",
  ssa: "SSA",
  webvtt: "WebVTT",
  pgssub: "PGS",
  dvdsub: "VobSub",
  dvd_subtitle: "VobSub",
};

export function codecName(codec: string | undefined): string | undefined {
  if (!codec) return undefined;
  return CODEC_NAMES[codec.toLowerCase()] ?? codec.toUpperCase();
}

let languageNames: Intl.DisplayNames | undefined;

export function languageName(code: string | undefined): string {
  if (!code || code === "und") return "Unknown language";
  try {
    languageNames ??= new Intl.DisplayNames(["en"], { type: "language" });
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function channelLabel(channels: number | undefined): string | undefined {
  switch (channels) {
    case undefined:
      return undefined;
    case 1:
      return "Mono";
    case 2:
      return "Stereo";
    case 6:
      return "5.1";
    case 8:
      return "7.1";
    default:
      return `${channels} channels`;
  }
}

export function runtimeLabel(ticks: number | undefined): string | undefined {
  if (!ticks) return undefined;
  const minutes = Math.round(ticks / TICKS_PER_MINUTE);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function sizeLabel(bytes: number | undefined): string | undefined {
  if (!bytes) return undefined;
  const gigabytes = bytes / 1024 ** 3;
  if (gigabytes >= 1) return `${gigabytes.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export function videoLabel(video: VideoInfo): string {
  const size = video.width && video.height ? `${video.width}×${video.height}` : undefined;
  const depth = video.bitDepth ? `${video.bitDepth}-bit` : undefined;
  return [codecName(video.codec), video.profile, size, depth].filter(Boolean).join(" · ");
}

export function audioLabel(audio: AudioInfo): string {
  const flags = audio.isDefault ? "default" : undefined;
  const format = [codecName(audio.codec), channelLabel(audio.channels)].filter(Boolean).join(" ");
  return [languageName(audio.language), format, flags].filter(Boolean).join(" · ");
}

export function subtitleLabel(subtitle: SubtitleInfo): string {
  const flags = [
    subtitle.isExternal ? "external" : undefined,
    subtitle.isForced ? "forced" : undefined,
    subtitle.isDefault ? "default" : undefined,
  ];
  return [languageName(subtitle.language), codecName(subtitle.codec), ...flags].filter(Boolean).join(" · ");
}
