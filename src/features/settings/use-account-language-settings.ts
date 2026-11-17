import { useReducer } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import { applyChange, ORIGINAL_LANGUAGE, revertChange, type AccountLanguageChange, type AccountLanguageSettings } from "../../domain/account-language-choices";
import type { AccountLanguages, LanguageCulture } from "../../domain/languages";
import { accountLanguageSettingsKey, accountLanguagesKey, languageCulturesKey } from "../shared/account-languages";
import { ACCOUNT_GC_TIME } from "../query-scope";
import { useToast } from "../shared/ui";
import { AUDIO_SAVE_FAILED, SUBTITLE_SAVE_FAILED, audioSaved, subtitleSaved } from "./languages-copy";

export type LanguageRow = "audio" | "subtitle";

export interface LanguageSave {
  row: LanguageRow;
  change: AccountLanguageChange;
  // The label of the chosen entry, for the saved toast.
  label: string;
}

interface SessionFlags {
  refused: boolean;
  originalLanguage: boolean;
}

// Kept per signed-in gateway while the app runs, so leaving Settings does not forget a refusal.
const flagsByGateway = new WeakMap<SessionGateway, SessionFlags>();

function flagsOf(gateway: SessionGateway): SessionFlags {
  let flags = flagsByGateway.get(gateway);
  if (!flags) {
    flags = { refused: false, originalLanguage: true };
    flagsByGateway.set(gateway, flags);
  }
  return flags;
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === "number" ? status : undefined;
}

// 403 and 405 mean the server (or a proxy in front of it) will not take the write.
function isRefusal(error: unknown): boolean {
  const status = statusOf(error);
  return status === 403 || status === 405;
}

// What P17-02's detail list reads from the same configuration.
function toAccountLanguages(settings: AccountLanguageSettings): AccountLanguages {
  return settings.subtitleLanguage ? { subtitleLanguage: settings.subtitleLanguage } : {};
}

export function useAccountLanguageSettings(gateway: SessionGateway) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const flags = flagsOf(gateway);
  const settingsKey = accountLanguageSettingsKey(gateway);

  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => gateway.accountLanguageSettings(signal),
    gcTime: ACCOUNT_GC_TIME,
  });
  const cultures = useQuery({
    queryKey: languageCulturesKey(gateway),
    queryFn: ({ signal }) => gateway.languageCultures(signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: ACCOUNT_GC_TIME,
  });

  const save = useMutation({
    mutationKey: [...settingsKey, "save"],
    mutationFn: (request: LanguageSave) => gateway.saveAccountLanguages(request.change),
    onMutate: async (request) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const previous = queryClient.getQueryData<AccountLanguageSettings>(settingsKey) ?? {};
      queryClient.setQueryData<AccountLanguageSettings>(settingsKey, applyChange(previous, request.change));
      return { previous };
    },
    onError: (error, request, context) => {
      queryClient.setQueryData<AccountLanguageSettings>(settingsKey, (current) => revertChange(current ?? {}, context?.previous ?? {}, request.change));
      if (isRefusal(error)) flags.refused = true;
      else if (statusOf(error) === 400 && request.change.AudioLanguagePreference === ORIGINAL_LANGUAGE) flags.originalLanguage = false;
      toast.show({ tone: "error", message: request.row === "audio" ? AUDIO_SAVE_FAILED : SUBTITLE_SAVE_FAILED });
      rerender();
      void queryClient.invalidateQueries({ queryKey: settingsKey });
    },
    onSuccess: (saved, request) => {
      // A later save still in flight owns the optimistic value; its own success writes the final one.
      if (queryClient.isMutating({ mutationKey: [...settingsKey, "save"] }) <= 1) {
        queryClient.setQueryData<AccountLanguageSettings>(settingsKey, saved);
        queryClient.setQueryData<AccountLanguages>(accountLanguagesKey(gateway), toAccountLanguages(saved));
      }
      toast.show({ tone: "ok", message: request.row === "audio" ? audioSaved(request.label) : subtitleSaved(request.label) });
    },
  });

  const refused = flags.refused || (settings.isError && isRefusal(settings.error));
  const cultureList: LanguageCulture[] | undefined = cultures.data;
  return {
    settings: settings.data,
    cultures: cultureList,
    loading: !refused && (settings.isPending || cultures.isPending) && !settings.isError && !cultures.isError,
    failed: !refused && ((settings.isError && settings.data === undefined) || cultures.isError),
    refused,
    originalLanguage: flags.originalLanguage,
    save: (request: LanguageSave) => save.mutate(request),
    retry: () => {
      void settings.refetch();
      void cultures.refetch();
    },
  };
}
