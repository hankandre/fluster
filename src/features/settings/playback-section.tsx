import { useState } from "react";
import { usePreferences } from "../../app/preferences";
import { isLimitChoice, STREAMING_LIMIT_CHOICES_MBPS, type StreamingLimits } from "../../lib/streaming-limits";
import { Picker, SettingsRow, SettingsSection, useSettingsRow, useToast, type PickerOption } from "../shared/ui";

const NO_LIMIT = "none";

const OPTIONS: PickerOption[] = [
  { value: NO_LIMIT, label: "No limit" },
  ...STREAMING_LIMIT_CHOICES_MBPS.map((mbps) => ({ value: String(mbps), label: `${mbps} Mbps` })),
];

type Field = keyof StreamingLimits;

const FIELD_NAME: Record<Field, string> = { localMbps: "Local network", remoteMbps: "Remote" };

export function PlaybackSection() {
  const { streamingLimits } = usePreferences();
  const toast = useToast();
  const [limits, setLimits] = useState<StreamingLimits>(() => streamingLimits.get());

  function change(field: Field, raw: string) {
    const mbps = Number(raw);
    const choice = isLimitChoice(mbps) ? mbps : undefined;
    if (choice === limits[field]) return;
    const next = { ...limits, [field]: choice };
    setLimits(next);
    streamingLimits.set(next);
    const name = FIELD_NAME[field];
    toast.show({ tone: "ok", message: choice === undefined ? `${name} limit removed.` : `${name} limit set to ${choice} Mbps.` });
  }

  return (
    <SettingsSection
      title="Playback"
      intro="Fluster plays the original file. If a file is above your limit, the server converts it to fit. Both limits start as No limit and apply the next time you press Play."
    >
      <SettingsRow label="Local network" description="Servers on this computer or your home network.">
        <LimitPicker label="Local network maximum bitrate" value={limits.localMbps} onChange={(raw) => change("localMbps", raw)} />
      </SettingsRow>
      <SettingsRow label="Remote" description="Servers on the internet.">
        <LimitPicker label="Remote maximum bitrate" value={limits.remoteMbps} onChange={(raw) => change("remoteMbps", raw)} />
      </SettingsRow>
      <SettingsRow label="Audio passthrough" unavailable="P5-03" />
    </SettingsSection>
  );
}

function LimitPicker({ label, value, onChange }: { label: string; value: number | undefined; onChange(raw: string): void }) {
  const { descriptionId } = useSettingsRow();
  return (
    <Picker
      label={label}
      hideLabel
      options={OPTIONS}
      value={value === undefined ? NO_LIMIT : String(value)}
      onChange={onChange}
      rovingItem
      openOnArrow={false}
      describedBy={descriptionId}
    />
  );
}
