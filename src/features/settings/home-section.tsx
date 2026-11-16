import { useSyncExternalStore } from "react";
import { usePreferences } from "../../app/preferences";
import type { ContinueWindow } from "../../domain/up-next";
import { Picker, SettingsRow, SettingsSection, useSettingsRow, useToast, type PickerOption } from "../shared/ui";

const OPTIONS: PickerOption[] = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "all", label: "Keep everything" },
];

function isWindow(value: string): value is ContinueWindow {
  return OPTIONS.some((option) => option.value === value);
}

export function HomeSection() {
  const { continueWindow } = usePreferences();
  const toast = useToast();
  const value = useSyncExternalStore(continueWindow.subscribe, continueWindow.get);

  function change(raw: string) {
    if (!isWindow(raw) || raw === value) return;
    continueWindow.set(raw);
    toast.show({ tone: "ok", message: raw === "all" ? "Continue watching keeps everything." : `Continue watching keeps ${raw} days.` });
  }

  return (
    <SettingsSection title="Home">
      <SettingsRow label="Continue watching" description="Titles you haven't played for this long leave the row. Their place is kept.">
        <WindowPicker value={value} onChange={change} />
      </SettingsRow>
    </SettingsSection>
  );
}

function WindowPicker({ value, onChange }: { value: ContinueWindow; onChange(raw: string): void }) {
  const { descriptionId } = useSettingsRow();
  return (
    <Picker
      label="How long Continue watching keeps a title"
      hideLabel
      options={OPTIONS}
      value={value}
      onChange={onChange}
      rovingItem
      openOnArrow={false}
      describedBy={descriptionId}
    />
  );
}
