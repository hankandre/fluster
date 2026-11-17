import { useSession, type SessionGateway } from "../../app/session";
import {
  audioChange,
  audioChoices,
  audioValueOf,
  subtitleChange,
  subtitleChoices,
  subtitleValueOf,
  type AccountLanguageSettings,
} from "../../domain/account-language-choices";
import type { LanguageCulture } from "../../domain/languages";
import { InlineError, Picker, SettingsRow, SettingsSection, useSettingsRow, type PickerOption } from "../shared/ui";
import {
  AUDIO_LABEL,
  AUDIO_PICKER_LABEL,
  LANGUAGES_INTRO,
  LOADING,
  READ_FAILED,
  REFUSED,
  SUBTITLE_LABEL,
  SUBTITLE_PICKER_LABEL,
  audioDescription,
  audioLabel,
  audioOptions,
  subtitleDescription,
  subtitleLabel,
  subtitleOptions,
} from "./languages-copy";
import { useAccountLanguageSettings } from "./use-account-language-settings";

// The audio and subtitle languages the Jellyfin account uses to pick starting tracks (DESIGN.md 7.18). They are
// saved to the account, not to this computer, and Fluster adds no preference logic of its own (P3-13).
export function LanguagesSection() {
  const { gateway } = useSession();
  if (!gateway) return <SettingsSection title="Languages" intro={LANGUAGES_INTRO} />;
  return <SignedInLanguages gateway={gateway} />;
}

function SignedInLanguages({ gateway }: { gateway: SessionGateway }) {
  const state = useAccountLanguageSettings(gateway);

  if (state.failed) {
    return (
      <SettingsSection title="Languages" intro={LANGUAGES_INTRO} footer={<InlineError message={READ_FAILED} onRetry={state.retry} />} />
    );
  }
  if (state.refused) {
    return (
      <SettingsSection title="Languages" intro={LANGUAGES_INTRO}>
        <SettingsRow label={AUDIO_LABEL} unavailableReason={REFUSED} />
        <SettingsRow label={SUBTITLE_LABEL} unavailableReason={REFUSED} />
      </SettingsSection>
    );
  }

  const ready = state.settings !== undefined && state.cultures !== undefined;
  const settings = state.settings ?? {};
  const cultures = state.cultures ?? [];
  return (
    <SettingsSection title="Languages" intro={LANGUAGES_INTRO}>
      <AudioRow ready={ready} settings={settings} cultures={cultures} originalLanguage={state.originalLanguage} onSave={state.save} />
      <SubtitleRow ready={ready} settings={settings} cultures={cultures} onSave={state.save} />
    </SettingsSection>
  );
}

type Save = ReturnType<typeof useAccountLanguageSettings>["save"];

interface RowProps {
  ready: boolean;
  settings: AccountLanguageSettings;
  cultures: readonly LanguageCulture[];
  onSave: Save;
}

function AudioRow({ ready, settings, cultures, originalLanguage, onSave }: RowProps & { originalLanguage: boolean }) {
  const choices = ready ? audioChoices(cultures, settings, { originalLanguage }) : [];
  const current = ready ? audioValueOf(settings, cultures) : undefined;

  function change(value: string) {
    if (!current || value === current.value) return;
    const next = audioChange(value);
    const choice = choices.find((candidate) => candidate.value === value);
    if (next && choice) onSave({ row: "audio", change: next, label: audioLabel(choice) });
  }

  return (
    <SettingsRow label={AUDIO_LABEL} description={current ? audioDescription(current) : undefined}>
      <LanguagePicker label={AUDIO_PICKER_LABEL} options={audioOptions(choices)} value={current?.value} onChange={change} />
    </SettingsRow>
  );
}

function SubtitleRow({ ready, settings, cultures, onSave }: RowProps) {
  const choices = ready ? subtitleChoices(cultures, settings) : [];
  const current = ready ? subtitleValueOf(settings, cultures) : undefined;

  function change(value: string) {
    if (!current || value === current.value) return;
    const next = subtitleChange(value);
    const choice = choices.find((candidate) => candidate.value === value);
    if (next && choice) onSave({ row: "subtitle", change: next, label: subtitleLabel(choice) });
  }

  return (
    <SettingsRow label={SUBTITLE_LABEL} description={current ? subtitleDescription(current) : undefined}>
      <LanguagePicker label={SUBTITLE_PICKER_LABEL} options={subtitleOptions(choices)} value={current?.value} onChange={change} />
    </SettingsRow>
  );
}

function LanguagePicker({ label, options, value, onChange }: { label: string; options: PickerOption[]; value: string | undefined; onChange(value: string): void }) {
  const { descriptionId } = useSettingsRow();
  return (
    <Picker
      label={label}
      hideLabel
      options={options}
      value={value}
      onChange={onChange}
      placeholder={LOADING}
      disabled={value === undefined}
      rovingItem
      openOnArrow={false}
      describedBy={descriptionId}
    />
  );
}
