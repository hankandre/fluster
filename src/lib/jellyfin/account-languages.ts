import type { AccountLanguageChange, AccountLanguageSettings } from "../../domain/account-language-choices";
import type { AccountLanguages, LanguageCulture } from "../../domain/languages";
import type { CultureDto } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Reads one field of GET /Users/Me: Configuration.SubtitleLanguagePreference. "", null, or absent means none.
export function toAccountLanguages(data: unknown): AccountLanguages {
  if (!isRecord(data) || !isRecord(data.Configuration)) return {};
  const preference = data.Configuration.SubtitleLanguagePreference;
  if (typeof preference !== "string" || preference.trim() === "") return {};
  return { subtitleLanguage: preference.trim() };
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

// A read of GET /Users/Me that holds no usable Configuration. Nothing is posted after it.
export class AccountConfigurationUnreadable extends Error {}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

// The four fields the Languages rows show, from a Configuration. Anything missing or of the wrong type is left out.
export function toAccountLanguageSettings(configuration: unknown): AccountLanguageSettings {
  if (!isPlainRecord(configuration)) return {};
  const settings: AccountLanguageSettings = {};
  const audio = nonEmptyString(configuration.AudioLanguagePreference);
  if (audio !== undefined) settings.audioLanguage = audio;
  if (typeof configuration.PlayDefaultAudioTrack === "boolean") settings.playDefaultAudioTrack = configuration.PlayDefaultAudioTrack;
  const subtitle = nonEmptyString(configuration.SubtitleLanguagePreference);
  if (subtitle !== undefined) settings.subtitleLanguage = subtitle;
  const mode = nonEmptyString(configuration.SubtitleMode);
  if (mode !== undefined) settings.subtitleMode = mode;
  return settings;
}

// The read Configuration with only the change's keys set. Every other key, known or not, is kept as read.
export function withLanguageChange(configuration: Record<string, unknown>, change: AccountLanguageChange): Record<string, unknown> {
  return { ...configuration, ...change };
}

// GET /Localization/Cultures, kept in the order the server listed it. An entry without a main three-letter name is skipped.
export function toLanguageCultures(data: unknown): LanguageCulture[] {
  if (!Array.isArray(data)) return [];
  const cultures: LanguageCulture[] = [];
  for (const entry of data as CultureDto[]) {
    if (!isRecord(entry)) continue;
    const main = entry.ThreeLetterISOLanguageName;
    if (typeof main !== "string" || main.trim() === "") continue;
    const threeLetterName = main.trim().toLowerCase();
    const names = Array.isArray(entry.ThreeLetterISOLanguageNames)
      ? entry.ThreeLetterISOLanguageNames.filter((name): name is string => typeof name === "string" && name.trim() !== "").map((name) => name.trim().toLowerCase())
      : [];
    if (!names.includes(threeLetterName)) names.push(threeLetterName);
    const two = typeof entry.TwoLetterISOLanguageName === "string" ? entry.TwoLetterISOLanguageName.trim().toLowerCase() : "";
    const displayName = [entry.DisplayName, entry.Name].find((name): name is string => typeof name === "string" && name !== "") ?? threeLetterName;
    cultures.push({ displayName, threeLetterName, threeLetterNames: names, ...(two ? { twoLetterName: two } : {}) });
  }
  return cultures;
}
