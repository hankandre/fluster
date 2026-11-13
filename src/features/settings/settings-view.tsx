import { useState } from "react";
import { SettingsPage } from "../shared/ui";
import { AboutSection } from "./about-section";
import { AccountSection } from "./account-section";
import { PlaybackSection } from "./playback-section";
import { SubtitlesSection } from "./subtitles-section";

const SECTIONS = [
  { id: "playback", label: "Playback" },
  { id: "subtitles", label: "Subtitles" },
  { id: "account", label: "Account" },
  { id: "about", label: "About & diagnostics" },
];

function panelFor(section: string) {
  switch (section) {
    case "subtitles":
      return <SubtitlesSection />;
    case "account":
      return <AccountSection />;
    case "about":
      return <AboutSection />;
    default:
      return <PlaybackSection />;
  }
}

// The Settings shell (DESIGN.md 7.18). The selected section is state here; the route stays one hash.
export function SettingsView() {
  const [section, setSection] = useState("playback");
  return (
    <main className="settings-page">
      <h1 className="settings-page-title">Settings</h1>
      <SettingsPage label="Settings sections" sections={SECTIONS} value={section} onChange={setSection}>
        {panelFor(section)}
      </SettingsPage>
    </main>
  );
}
