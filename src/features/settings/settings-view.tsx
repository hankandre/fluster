import { useState } from "react";
import { SettingsPage } from "../shared/ui";
import { SETTINGS_SECTIONS, SettingsPanel } from "./settings-sections";

// The Settings shell (DESIGN.md 7.18). The selected section is state here; the route stays one hash.
export function SettingsView() {
  const [section, setSection] = useState("playback");
  return (
    <main className="settings-page">
      <h1 className="settings-page-title">Settings</h1>
      <SettingsPage label="Settings sections" sections={SETTINGS_SECTIONS} value={section} onChange={setSection}>
        <SettingsPanel section={section} />
      </SettingsPage>
    </main>
  );
}
