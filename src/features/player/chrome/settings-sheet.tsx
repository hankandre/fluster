import { useMemo, useRef, useState } from "react";
import { SettingsPage } from "../../shared/ui";
import { SignOutConfirm } from "../../settings/sign-out-confirm";
import { SettingsHostProvider } from "../../settings/settings-host";
import { playerSettingsSections, SettingsPanel } from "../../settings/settings-sections";
import { PlayerSheet } from "./player-sheet";

// The Settings side sheet (DESIGN.md 7.14): the Settings page's sections in their compact form, so one section
// shows at a time, with each row's control under its text. Changes apply at once and confirm on the OSD. Leaving
// the account asks first, because it ends what the viewer is watching.
export function SettingsSheet({ id, onClose, confirm, onSignOut }: {
  id?: string;
  onClose(): void;
  // One short confirmation line, shown on the OSD.
  confirm(message: string): void;
  // Stops playback and signs out; the sheet asks before calling it.
  onSignOut(): void;
}) {
  const [section, setSection] = useState("playback");
  const [confirming, setConfirming] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const sections = useMemo(playerSettingsSections, []);
  const host = useMemo(() => ({ place: "player" as const, confirm, signOut: () => setConfirming(true) }), [confirm]);

  // Opening a section or going back starts at the top of the sheet.
  const resetScroll = () => {
    const body = content.current?.closest<HTMLElement>(".player-sheet-body");
    if (body) body.scrollTop = 0;
  };

  return (
    <PlayerSheet id={id} label="Player settings" title="Settings" onClose={onClose} keyRows>
      <SettingsHostProvider host={host}>
        <div ref={content}>
          <SettingsPage label="Settings sections" sections={sections} value={section} onChange={setSection} form="compact" onViewChange={resetScroll}>
            <SettingsPanel section={section} />
          </SettingsPage>
        </div>
      </SettingsHostProvider>
      <SignOutConfirm open={confirming} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onSignOut(); }} />
    </PlayerSheet>
  );
}
