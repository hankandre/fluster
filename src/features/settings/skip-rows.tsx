import { useSyncExternalStore } from "react";
import { usePreferences } from "../../app/preferences";
import { SKIP_MODES, type SkipMode, type SkipModes } from "../../domain/media-segments";
import { useSettingsHost } from "./settings-host";
import { Picker, SettingsRow, useSettingsRow, type PickerOption } from "../shared/ui";

const OPTIONS: PickerOption[] = [
  { value: "button", label: "Show a Skip button" },
  { value: "auto", label: "Skip automatically" },
  { value: "none", label: "Do nothing" },
];

function isSkipMode(value: string): value is SkipMode {
  return SKIP_MODES.some((mode) => mode === value);
}

interface RowCopy {
  kind: keyof SkipModes;
  label: string;
  description: string;
  pickerLabel: string;
}

const ROWS: RowCopy[] = [
  { kind: "intro", label: "Intros", description: "When the server has marked an intro.", pickerLabel: "What happens at an intro" },
  {
    kind: "credits",
    label: "Credits",
    description: "When the server has marked the credits. If a next episode is ready, Up Next shows instead.",
    pickerLabel: "What happens at the credits",
  },
];

export function SkipRows() {
  const { skipModes } = usePreferences();
  const host = useSettingsHost();
  const modes = useSyncExternalStore(skipModes.subscribe, skipModes.get);

  function change(row: RowCopy, raw: string) {
    if (!isSkipMode(raw) || raw === modes[row.kind]) return;
    skipModes.set(row.kind, raw);
    const option = OPTIONS.find((candidate) => candidate.value === raw);
    host.confirm(`${row.label}: ${option?.label ?? raw}.`, row.label);
  }

  return (
    <>
      {ROWS.map((row) => (
        <SettingsRow key={row.kind} label={row.label} description={row.description}>
          <SkipModePicker label={row.pickerLabel} value={modes[row.kind]} onChange={(raw) => change(row, raw)} />
        </SettingsRow>
      ))}
    </>
  );
}

function SkipModePicker({ label, value, onChange }: { label: string; value: SkipMode; onChange(raw: string): void }) {
  const { descriptionId } = useSettingsRow();
  return (
    <Picker
      label={label}
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
