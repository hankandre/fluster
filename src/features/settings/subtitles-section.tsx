import { SettingsSection } from "../shared/ui";

// Languages come from the Jellyfin account (Q23 A). There is no link, no server read, and nothing to focus.
export function SubtitlesSection() {
  return <SettingsSection title="Subtitles" intro="Subtitle languages follow your Jellyfin account; change them in Jellyfin." />;
}
