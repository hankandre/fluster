import { languageKey, type LanguageCulture } from "./languages";

// What the Languages rows in Settings offer and show. The account holds two fields per row; each choice names
// the fields it writes (P17-01, docs/research/account-languages-api.md). No copy lives here.

export type SubtitleMode = "Default" | "Always" | "OnlyForced" | "None" | "Smart";

export const ORIGINAL_LANGUAGE = "OriginalLanguage";

export interface AccountLanguageSettings {
  audioLanguage?: string; // "OriginalLanguage" is kept as is
  playDefaultAudioTrack?: boolean;
  subtitleLanguage?: string;
  subtitleMode?: string; // as the server gave it
}

// The only account fields a language save may set.
export type AccountLanguageChange = Partial<{
  AudioLanguagePreference: string;
  PlayDefaultAudioTrack: boolean;
  SubtitleLanguagePreference: string;
  SubtitleMode: SubtitleMode;
}>;

export interface LanguageOption {
  code: string; // the main three-letter name, which is what the server compares
  name: string; // the server's label
}

export type CurrentKind = "other-app" | "unknown-code" | "forced-only";

export type AudioChoice =
  | { value: "default"; kind: "default" }
  | { value: "original"; kind: "original" }
  | { value: `lang:${string}`; kind: "language"; language: LanguageOption }
  | { value: "current"; kind: CurrentKind; code?: string; name?: string; mode?: string };

export type SubtitleChoice =
  | { value: "off"; kind: "off" }
  | { value: "default"; kind: "default" }
  | { value: `smart:${string}`; kind: "smart"; language: LanguageOption }
  | { value: `always:${string}`; kind: "always"; language: LanguageOption }
  | { value: "current"; kind: CurrentKind; code?: string; name?: string; mode?: string };

const THREE_LETTERS = /^[a-z]{3}$/;

// One entry per main three-letter name, labelled by the first culture that lists it, sorted by label.
export function languageOptions(cultures: readonly LanguageCulture[]): LanguageOption[] {
  const seen = new Set<string>();
  const options: LanguageOption[] = [];
  for (const culture of cultures) {
    const code = culture.threeLetterName;
    if (!THREE_LETTERS.test(code) || seen.has(code)) continue;
    seen.add(code);
    options.push({ code, name: culture.displayName });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function optionFor(code: string | undefined, cultures: readonly LanguageCulture[], options: readonly LanguageOption[]): LanguageOption | undefined {
  const key = languageKey(code, cultures);
  return key === undefined ? undefined : options.find((option) => option.code === key);
}

function savedCode(code: string | undefined): string | undefined {
  const trimmed = code?.trim();
  return trimmed ? trimmed : undefined;
}

// How the account's audio fields read, as one choice. A state no recorded cell shows becomes a current-only entry.
export function audioValueOf(settings: AccountLanguageSettings, cultures: readonly LanguageCulture[]): AudioChoice {
  if (settings.playDefaultAudioTrack === true) return { value: "default", kind: "default" };
  if (settings.playDefaultAudioTrack !== false) return { value: "current", kind: "other-app" };
  const code = savedCode(settings.audioLanguage);
  if (code === undefined) return { value: "current", kind: "other-app" };
  if (code === ORIGINAL_LANGUAGE) return { value: "original", kind: "original" };
  const language = optionFor(code, cultures, languageOptions(cultures));
  if (language) return { value: `lang:${language.code}`, kind: "language", language };
  return { value: "current", kind: "unknown-code", code };
}

export function subtitleValueOf(settings: AccountLanguageSettings, cultures: readonly LanguageCulture[]): SubtitleChoice {
  const mode = settings.subtitleMode;
  if (mode === "None") return { value: "off", kind: "off" };
  if (mode === "Default") return { value: "default", kind: "default" };
  const code = savedCode(settings.subtitleLanguage);
  if (code === undefined || (mode !== "Smart" && mode !== "Always" && mode !== "OnlyForced")) return { value: "current", kind: "other-app" };
  const language = optionFor(code, cultures, languageOptions(cultures));
  if (!language) return { value: "current", kind: "unknown-code", code, mode };
  if (mode === "OnlyForced") return { value: "current", kind: "forced-only", code: language.code, name: language.name, mode };
  return mode === "Smart" ? { value: `smart:${language.code}`, kind: "smart", language } : { value: `always:${language.code}`, kind: "always", language };
}

// The choices to offer, a current-only entry first when the read needs one. Original language can be turned off
// for a server that refused it; a read that already shows it keeps it so the trigger still has a label.
export function audioChoices(cultures: readonly LanguageCulture[], settings: AccountLanguageSettings, { originalLanguage }: { originalLanguage: boolean }): AudioChoice[] {
  const current = audioValueOf(settings, cultures);
  const choices: AudioChoice[] = [];
  if (current.value === "current") choices.push(current);
  choices.push({ value: "default", kind: "default" });
  if (originalLanguage || current.kind === "original") choices.push({ value: "original", kind: "original" });
  for (const language of languageOptions(cultures)) choices.push({ value: `lang:${language.code}`, kind: "language", language });
  return choices;
}

export function subtitleChoices(cultures: readonly LanguageCulture[], settings: AccountLanguageSettings): SubtitleChoice[] {
  const current = subtitleValueOf(settings, cultures);
  const choices: SubtitleChoice[] = [];
  if (current.value === "current") choices.push(current);
  choices.push({ value: "off", kind: "off" }, { value: "default", kind: "default" });
  for (const language of languageOptions(cultures)) {
    choices.push({ value: `smart:${language.code}`, kind: "smart", language }, { value: `always:${language.code}`, kind: "always", language });
  }
  return choices;
}

// The fields a choice writes, or undefined for a current-only entry, which is never saved.
export function audioChange(value: string): AccountLanguageChange | undefined {
  if (value === "default") return { PlayDefaultAudioTrack: true };
  if (value === "original") return { AudioLanguagePreference: ORIGINAL_LANGUAGE, PlayDefaultAudioTrack: false };
  if (value.startsWith("lang:") && value.length > 5) return { AudioLanguagePreference: value.slice(5), PlayDefaultAudioTrack: false };
  return undefined;
}

export function subtitleChange(value: string): AccountLanguageChange | undefined {
  if (value === "off") return { SubtitleMode: "None" };
  if (value === "default") return { SubtitleMode: "Default" };
  if (value.startsWith("smart:") && value.length > 6) return { SubtitleLanguagePreference: value.slice(6), SubtitleMode: "Smart" };
  if (value.startsWith("always:") && value.length > 7) return { SubtitleLanguagePreference: value.slice(7), SubtitleMode: "Always" };
  return undefined;
}

const FIELD_OF = {
  AudioLanguagePreference: "audioLanguage",
  PlayDefaultAudioTrack: "playDefaultAudioTrack",
  SubtitleLanguagePreference: "subtitleLanguage",
  SubtitleMode: "subtitleMode",
} as const satisfies Record<keyof AccountLanguageChange, keyof AccountLanguageSettings>;

// The settings after a change is applied, for an optimistic update.
export function applyChange(settings: AccountLanguageSettings, change: AccountLanguageChange): AccountLanguageSettings {
  const next: Record<string, unknown> = { ...settings };
  for (const key of Object.keys(change) as (keyof AccountLanguageChange)[]) next[FIELD_OF[key]] = change[key];
  return next as AccountLanguageSettings;
}

// Puts back only the fields a change set, taking them from `previous`. Fields the change did not touch stay as
// they are now, so a revert never undoes another row's save.
export function revertChange(current: AccountLanguageSettings, previous: AccountLanguageSettings, change: AccountLanguageChange): AccountLanguageSettings {
  const next: Record<string, unknown> = { ...current };
  for (const key of Object.keys(change) as (keyof AccountLanguageChange)[]) {
    const field = FIELD_OF[key];
    if (previous[field] === undefined) delete next[field];
    else next[field] = previous[field];
  }
  return next as AccountLanguageSettings;
}
