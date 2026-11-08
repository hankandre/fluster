import { useState, type ChangeEvent } from "react";
import { usePreferences } from "../../app/preferences";
import { isLimitChoice, STREAMING_LIMIT_CHOICES_MBPS, type StreamingLimits } from "../../lib/streaming-limits";

const NO_LIMIT = "none";

export function SettingsView() {
  const { streamingLimits } = usePreferences();
  const [limits, setLimits] = useState<StreamingLimits>(() => streamingLimits.get());

  function change(field: keyof StreamingLimits) {
    return (event: ChangeEvent<HTMLSelectElement>) => {
      const value = Number(event.target.value);
      const next = { ...limits, [field]: isLimitChoice(value) ? value : undefined };
      setLimits(next);
      streamingLimits.set(next);
    };
  }

  return (
    <main className="settings">
      <h1>Settings</h1>
      <section aria-labelledby="streaming-limits">
        <h2 id="streaming-limits">Streaming limits</h2>
        <p>
          Fluster plays the original file. If a file is above your limit, the server converts it to fit.
          Both limits start as No limit and apply the next time you press Play.
        </p>
        <LimitSelect
          label="Local network"
          hint="Servers on this computer or your home network."
          value={limits.localMbps}
          onChange={change("localMbps")}
        />
        <LimitSelect
          label="Remote"
          hint="Servers on the internet."
          value={limits.remoteMbps}
          onChange={change("remoteMbps")}
        />
      </section>
      <a href="#/next/home">Home</a>
      <a href="#/next">Back to features</a>
    </main>
  );
}

function LimitSelect({ label, hint, value, onChange }: {
  label: string;
  hint: string;
  value: number | undefined;
  onChange(event: ChangeEvent<HTMLSelectElement>): void;
}) {
  return (
    <div className="settings-field">
      <label>
        {label} maximum bitrate
        <select value={value === undefined ? NO_LIMIT : String(value)} onChange={onChange}>
          <option value={NO_LIMIT}>No limit</option>
          {STREAMING_LIMIT_CHOICES_MBPS.map((mbps) => (
            <option key={mbps} value={mbps}>{mbps} Mbps</option>
          ))}
        </select>
      </label>
      <p>{hint}</p>
    </div>
  );
}
