import { useState, useSyncExternalStore } from "react";
import { usePreferences } from "../../app/preferences";
import { COUNTDOWN_CHOICES_SECONDS } from "../../lib/preference-store";
import { isLimitChoice, STREAMING_LIMIT_CHOICES_MBPS, type StreamingLimits } from "../../lib/streaming-limits";
import { SkipRows } from "./skip-rows";
import { useSettingsHost } from "./settings-host";
import { STAGED_FOR_LATER } from "./staged-for-later";
import { Picker, SettingsRow, SettingsSection, Switch, useSettingsRow, type PickerOption } from "../shared/ui";

const NO_LIMIT = "none";

const OPTIONS: PickerOption[] = [
  { value: NO_LIMIT, label: "No limit" },
  ...STREAMING_LIMIT_CHOICES_MBPS.map((mbps) => ({ value: String(mbps), label: `${mbps} Mbps` })),
];

const COUNTDOWN_OPTIONS: PickerOption[] = COUNTDOWN_CHOICES_SECONDS.map((seconds) => ({ value: String(seconds), label: `${seconds} seconds` }));

type Field = keyof StreamingLimits;

const FIELD_NAME: Record<Field, string> = { localMbps: "Local network", remoteMbps: "Remote" };

export function PlaybackSection() {
  const { streamingLimits, autoPlay } = usePreferences();
  const autoPlayValue = useSyncExternalStore(autoPlay.subscribe, autoPlay.get);
  const host = useSettingsHost();
  const showLimits = host.place === "page" || !STAGED_FOR_LATER.playbackLimitRows;
  const [limits, setLimits] = useState<StreamingLimits>(() => streamingLimits.get());

  function change(field: Field, raw: string) {
    const mbps = Number(raw);
    const choice = isLimitChoice(mbps) ? mbps : undefined;
    if (choice === limits[field]) return;
    const next = { ...limits, [field]: choice };
    setLimits(next);
    streamingLimits.set(next);
    const name = FIELD_NAME[field];
    host.confirm(choice === undefined ? `${name} limit removed.` : `${name} limit set to ${choice} Mbps.`);
  }

  function toggleAutoPlay(enabled: boolean) {
    autoPlay.set({ ...autoPlayValue, enabled });
    host.confirm(enabled ? "Next episodes play automatically." : "Next episodes won't play automatically.");
  }

  function changeCountdown(raw: string) {
    const seconds = COUNTDOWN_CHOICES_SECONDS.find((choice) => String(choice) === raw);
    if (seconds === undefined || seconds === autoPlayValue.countdownSeconds) return;
    autoPlay.set({ ...autoPlayValue, countdownSeconds: seconds });
    host.confirm(`Countdown set to ${seconds} seconds.`);
  }

  return (
    <SettingsSection
      title="Playback"
      intro={showLimits ? "Fluster plays the original file. If a file is above your limit, the server converts it to fit. Both limits start as No limit and apply the next time you press Play." : undefined}
    >
      {showLimits ? (
        <SettingsRow label="Local network" description="Servers on this computer or your home network.">
          <LimitPicker label="Local network maximum bitrate" value={limits.localMbps} onChange={(raw) => change("localMbps", raw)} />
        </SettingsRow>
      ) : null}
      {showLimits ? (
        <SettingsRow label="Remote" description="Servers on the internet.">
          <LimitPicker label="Remote maximum bitrate" value={limits.remoteMbps} onChange={(raw) => change("remoteMbps", raw)} />
        </SettingsRow>
      ) : null}
      <SettingsRow label="Play next episode automatically" description="At the end of an episode, play the next one after a countdown.">
        <AutoPlaySwitch checked={autoPlayValue.enabled} onChange={toggleAutoPlay} />
      </SettingsRow>
      <SettingsRow label="Countdown" description="How long Up next waits before playing.">
        <CountdownPicker value={autoPlayValue.countdownSeconds} onChange={changeCountdown} />
      </SettingsRow>
      <SkipRows />
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

function AutoPlaySwitch({ checked, onChange }: { checked: boolean; onChange(checked: boolean): void }) {
  const { descriptionId } = useSettingsRow();
  return <Switch label="Play next episode automatically" checked={checked} onCheckedChange={onChange} rovingItem describedBy={descriptionId} />;
}

function CountdownPicker({ value, onChange }: { value: number; onChange(raw: string): void }) {
  const { descriptionId } = useSettingsRow();
  return (
    <Picker
      label="Countdown before the next episode"
      hideLabel
      options={COUNTDOWN_OPTIONS}
      value={String(value)}
      onChange={onChange}
      rovingItem
      openOnArrow={false}
      describedBy={descriptionId}
    />
  );
}
