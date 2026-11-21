import type { SubtitleInfo } from "./catalog";
import { languageKey, type LanguageCulture } from "./languages";

export interface ListedSubtitle {
  index: number; // into version.subtitles
  subtitle: SubtitleInfo;
}

export type SubtitleListView =
  | { kind: "none" } // no subtitle tracks
  | { kind: "all"; shown: ListedSubtitle[] } // every track listed: no line, no button
  | { kind: "preferred"; shown: ListedSubtitle[]; total: number }
  | { kind: "summary"; shown: ListedSubtitle[]; remaining: number; remainingLanguages: number; total: number };

// Which subtitle tracks the detail page lists up front (P17-02). Display only: the server picks the track that plays.
export function subtitleListView(
  subtitles: readonly SubtitleInfo[],
  preference: string | undefined,
  cultures: readonly LanguageCulture[] | undefined,
): SubtitleListView {
  const total = subtitles.length;
  const listed: ListedSubtitle[] = subtitles.map((subtitle, index) => ({ index, subtitle }));
  if (total === 0) return { kind: "none" };
  if (total === 1) return { kind: "all", shown: listed };

  const preferenceKey = languageKey(preference, cultures);
  if (preferenceKey !== undefined) {
    const matches = listed.filter((entry) => languageKey(entry.subtitle.language, cultures) === preferenceKey);
    if (matches.length === total) return { kind: "all", shown: matches };
    if (matches.length > 0) return { kind: "preferred", shown: matches, total };
  }

  const defaultTrack = listed.find((entry) => entry.subtitle.isDefault);
  const shown = defaultTrack ? [defaultTrack] : [];
  const languages = new Set<string>();
  for (const entry of listed) {
    if (entry === defaultTrack) continue;
    const key = languageKey(entry.subtitle.language, cultures);
    if (key !== undefined) languages.add(key);
  }
  return { kind: "summary", shown, remaining: total - shown.length, remainingLanguages: languages.size, total };
}
