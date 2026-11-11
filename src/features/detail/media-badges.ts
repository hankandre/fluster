import type { DynamicRange, ItemVersion } from "../../domain/catalog";
import { channelLabel, codecName } from "./format";

const FOUR_K_WIDTH = 3200;
const MAX_BADGES = 5;
const IMAGE_SUBTITLES: Record<string, string> = {
  pgssub: "PGS",
  dvdsub: "VobSub",
  dvd_subtitle: "VobSub",
  ass: "ASS",
  ssa: "SSA",
};

export function isFourK(width: number | undefined): boolean {
  return width !== undefined && width >= FOUR_K_WIDTH;
}

export function rangeLabel(range: DynamicRange | undefined): string | undefined {
  if (!range || range === "SDR" || range === "Unknown") return undefined;
  return range.startsWith("Dolby Vision") ? "Dolby Vision" : range;
}

// Up to five text badges for one version, in the order of DESIGN.md 7.9: 4K, range, audio, Atmos, subtitles.
export function mediaBadges(version: ItemVersion): string[] {
  const badges: (string | undefined)[] = [];
  badges.push(isFourK(version.video?.width) ? "4K" : undefined);
  badges.push(rangeLabel(version.video?.hdr));
  const audio = version.audio.find((track) => track.isDefault) ?? version.audio[0];
  if (audio) {
    badges.push([codecName(audio.codec), channelLabel(audio.channels)].filter(Boolean).join(" ") || undefined);
    badges.push(audio.title && /atmos/i.test(audio.title) ? "Atmos" : undefined);
  }
  const formats: string[] = [];
  for (const subtitle of version.subtitles) {
    const name = subtitle.codec ? IMAGE_SUBTITLES[subtitle.codec.toLowerCase()] : undefined;
    if (name && !formats.includes(name)) formats.push(name);
  }
  badges.push(formats.length > 0 ? formats.join(" · ") : undefined);
  return badges.filter((badge): badge is string => Boolean(badge)).slice(0, MAX_BADGES);
}

// The Picker option description: the badges on one line.
export function versionSummary(version: ItemVersion): string {
  return mediaBadges(version).join(" · ");
}
