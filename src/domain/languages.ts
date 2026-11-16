// Language codes as languages, for display only. Nothing here decides what plays.
export interface LanguageCulture {
  displayName: string;
  threeLetterName: string; // ThreeLetterISOLanguageName, lowercased
  threeLetterNames: string[]; // every three-letter code for it, lowercased (deu, ger)
  twoLetterName?: string; // lowercased; absent when the server gives ""
}

export interface AccountLanguages {
  subtitleLanguage?: string;
}

const lookups = new WeakMap<readonly LanguageCulture[], Map<string, string>>();

function lookupFor(cultures: readonly LanguageCulture[]): Map<string, string> {
  const cached = lookups.get(cultures);
  if (cached) return cached;
  const map = new Map<string, string>();
  for (const culture of cultures) {
    const codes = [culture.threeLetterName, ...culture.threeLetterNames];
    if (culture.twoLetterName) codes.push(culture.twoLetterName);
    for (const code of codes) {
      if (!map.has(code)) map.set(code, culture.threeLetterName);
    }
  }
  lookups.set(cultures, map);
  return map;
}

// One key per language: the culture's main three-letter name when the code is any of its names, else the
// lowercased code. Undefined for a missing, empty, or "und" tag, which names no language.
export function languageKey(code: string | undefined, cultures: readonly LanguageCulture[] | undefined): string | undefined {
  const normal = code?.trim().toLowerCase();
  if (!normal || normal === "und") return undefined;
  if (!cultures) return normal;
  return lookupFor(cultures).get(normal) ?? normal;
}
