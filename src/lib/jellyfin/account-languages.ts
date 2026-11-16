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
    const displayName = entry.DisplayName ?? entry.Name ?? threeLetterName;
    cultures.push({ displayName, threeLetterName, threeLetterNames: names, ...(two ? { twoLetterName: two } : {}) });
  }
  return cultures;
}
