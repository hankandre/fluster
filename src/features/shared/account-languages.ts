import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import type { LanguageCulture } from "../../domain/languages";
import { ACCOUNT_GC_TIME, scopeFor } from "../query-scope";

export function accountLanguagesKey(gateway: SessionGateway) {
  return ["account", scopeFor(gateway), "languages"] as const;
}

// The account's four language fields for the Languages rows in Settings.
export function accountLanguageSettingsKey(gateway: SessionGateway) {
  return ["account", scopeFor(gateway), "language-settings"] as const;
}

export function languageCulturesKey(gateway: SessionGateway) {
  return ["account", scopeFor(gateway), "cultures"] as const;
}

interface LanguagePreference {
  preference: string | undefined;
  cultures: LanguageCulture[] | undefined;
}

// The account's subtitle language for display. Undefined while either read is pending, and on any failure:
// the page never waits for it and shows no error (P17-02).
export function useSubtitlePreference(gateway: SessionGateway): LanguagePreference {
  return useLanguagePreference(gateway, "subtitleLanguage");
}

// The account's audio language, which orders the title page's audio Picker (P17-08). Same rule: undefined
// until both reads settle, and on any failure.
export function useAudioPreference(gateway: SessionGateway): LanguagePreference {
  return useLanguagePreference(gateway, "audioLanguage");
}

function useLanguagePreference(gateway: SessionGateway, field: "subtitleLanguage" | "audioLanguage"): LanguagePreference {
  const account = useQuery({
    queryKey: accountLanguagesKey(gateway),
    queryFn: ({ signal }) => gateway.accountLanguages(signal),
    gcTime: ACCOUNT_GC_TIME,
  });
  const cultures = useQuery({
    queryKey: languageCulturesKey(gateway),
    queryFn: ({ signal }) => gateway.languageCultures(signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: ACCOUNT_GC_TIME,
  });
  const settled = !cultures.isPending;
  return {
    preference: account.isSuccess && settled ? account.data[field] : undefined,
    cultures: cultures.data,
  };
}
