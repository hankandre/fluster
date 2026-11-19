import { AboutSection } from "./about-section";
import { AccountSection } from "./account-section";
import { HomeSection } from "./home-section";
import { LanguagesSection } from "./languages-section";
import { PlaybackSection } from "./playback-section";
import { STAGED_FOR_LATER } from "./staged-for-later";
import { SubtitlesSection } from "./subtitles-section";

// The one definition of the Settings sections, in order. The page and the player's Settings sheet both render it.
export const SETTINGS_SECTIONS = [
  { id: "playback", label: "Playback" },
  { id: "home", label: "Home" },
  { id: "languages", label: "Languages" },
  { id: "subtitles", label: "Subtitles" },
  { id: "account", label: "Account" },
  { id: "about", label: "About & diagnostics" },
];

export { STAGED_FOR_LATER };

export function playerSettingsSections() {
  return SETTINGS_SECTIONS.filter((section) => !STAGED_FOR_LATER.sections.includes(section.id));
}

export function SettingsPanel({ section }: { section: string }) {
  switch (section) {
    case "home":
      return <HomeSection />;
    case "languages":
      return <LanguagesSection />;
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
