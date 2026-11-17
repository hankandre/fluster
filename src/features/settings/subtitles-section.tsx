import { SettingsRow, SettingsSection } from "../shared/ui";

// Subtitle languages are in Languages. Styling arrives with P5-05, so the one row waits (Q23 A pattern).
export function SubtitlesSection() {
  return (
    <SettingsSection title="Subtitles">
      <SettingsRow label="Subtitle style" unavailable="P5-05" />
    </SettingsSection>
  );
}
