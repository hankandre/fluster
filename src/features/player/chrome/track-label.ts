import type { MediaTrack, PlayerTrack } from "../../../domain/playback";
import { channelLabel, codecName, languageName } from "../../detail/format";

export interface TrackFacts {
  kind: "Audio" | "Subtitle";
  language?: string;
  // The stream's own title.
  title?: string;
  // Used as the name when there is no language or title.
  fallbackTitle: string;
  codec?: string;
  channels?: number;
  isDefault: boolean;
  isForced: boolean;
  isHearingImpaired: boolean;
  external: boolean;
}

export interface TrackLabel {
  name: string;
  detail?: string;
}

function kindOf(type: MediaTrack["type"]): TrackFacts["kind"] {
  return type === "Audio" ? "Audio" : "Subtitle";
}

export function trackFactsFromPlan(track: MediaTrack): TrackFacts {
  return {
    kind: kindOf(track.type),
    ...(track.language ? { language: track.language } : {}),
    ...(track.title ? { title: track.title } : {}),
    fallbackTitle: track.displayTitle,
    ...(track.codec ? { codec: track.codec } : {}),
    ...(track.channels ? { channels: track.channels } : {}),
    isDefault: Boolean(track.isDefault),
    isForced: Boolean(track.isForced),
    isHearingImpaired: Boolean(track.isHearingImpaired),
    external: track.external,
  };
}

// An mpv track with no plan match: only what the player reports.
export function trackFactsFromPlayer(track: PlayerTrack): TrackFacts {
  return {
    kind: kindOf(track.type),
    ...(track.language ? { language: track.language } : {}),
    title: track.title,
    fallbackTitle: track.title,
    isDefault: false,
    isForced: false,
    isHearingImpaired: false,
    external: track.external,
  };
}

function nameOf(facts: TrackFacts): string {
  const hasLanguage = Boolean(facts.language) && facts.language !== "und";
  const language = hasLanguage ? languageName(facts.language) : undefined;
  const title = facts.title?.trim() || undefined;
  if (language && title) {
    return title.toLowerCase().includes(language.toLowerCase()) ? title : `${language} · ${title}`;
  }
  return language ?? title ?? facts.fallbackTitle;
}

// Two lines: the name, then the format and the flags in words.
export function trackRow(facts: TrackFacts): TrackLabel {
  const codec = codecName(facts.codec);
  const format = facts.kind === "Audio"
    ? [codec, channelLabel(facts.channels)].filter(Boolean).join(" ")
    : codec;
  const parts = [
    format,
    facts.isForced ? "forced" : undefined,
    facts.isHearingImpaired ? "hard of hearing" : undefined,
    facts.isDefault ? "default" : undefined,
    facts.external ? "external" : undefined,
  ].filter((part): part is string => Boolean(part));
  const name = nameOf(facts);
  return parts.length > 0 ? { name, detail: parts.join(" · ") } : { name };
}
