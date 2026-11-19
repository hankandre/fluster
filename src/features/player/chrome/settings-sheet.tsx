import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SavedRowProvider, SettingsPage, type SavedRow } from "../../shared/ui";
import { SignOutConfirm } from "../../settings/sign-out-confirm";
import { SettingsHostProvider } from "../../settings/settings-host";
import { playerSettingsSections, SettingsPanel } from "../../settings/settings-sections";
import { PlayerSheet } from "./player-sheet";
import { SAVED_MS } from "./timing";

// The Settings side sheet (DESIGN.md 7.14): the Settings page's sections in their compact form, so one section
// shows at a time, with each row's control under its text. Changes apply at once and confirm with "Saved" beside
// the changed row, never on the OSD. Leaving
// the account asks first, because it ends what the viewer is watching.
export function SettingsSheet({ id, onClose, onSignOut }: {
  id?: string;
  onClose(): void;
  // Stops playback and signs out; the sheet asks before calling it.
  onSignOut(): void;
}) {
  const [section, setSection] = useState("playback");
  const [confirming, setConfirming] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const sections = useMemo(playerSettingsSections, []);
  const [saved, setSaved] = useState<SavedRow>();
  const timer = useRef<number | undefined>(undefined);
  const serial = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);
  // The message is the page's toast copy; the sheet shows the row's "Saved" instead.
  const confirm = useCallback((_message: string, row: string, word = "Saved") => {
    // A Copy that finishes after the sheet closed has no row to mark.
    if (!mounted.current) return;
    window.clearTimeout(timer.current);
    serial.current += 1;
    setSaved({ row, word, serial: serial.current });
    timer.current = window.setTimeout(() => setSaved(undefined), SAVED_MS);
  }, []);
  const host = useMemo(() => ({ place: "player" as const, confirm, signOut: () => setConfirming(true) }), [confirm]);
  const savedValue = useMemo(() => ({ saved }), [saved]);

  // Opening a section or going back starts at the top of the sheet.
  const resetScroll = () => {
    const body = content.current?.closest<HTMLElement>(".player-sheet-body");
    if (body) body.scrollTop = 0;
  };

  return (
    <PlayerSheet id={id} label="Player settings" title="Settings" onClose={onClose} keyRows>
      <SettingsHostProvider host={host}>
        <SavedRowProvider value={savedValue}>
          <div ref={content}>
            <SettingsPage label="Settings sections" sections={sections} value={section} onChange={setSection} form="compact" onViewChange={resetScroll}>
              <SettingsPanel section={section} />
            </SettingsPage>
          </div>
        </SavedRowProvider>
      </SettingsHostProvider>
      <SignOutConfirm open={confirming} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onSignOut(); }} />
    </PlayerSheet>
  );
}
