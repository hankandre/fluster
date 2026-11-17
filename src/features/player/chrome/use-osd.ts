import { useCallback, useEffect, useRef, useState } from "react";
import { OSD_MS, OSD_NOTICE_MS } from "./timing";

// "notice" is the conversion line and "audio" is the audio-pick line; both use the notice slot.
export type OsdKind = "key" | "notice" | "audio";

export interface OsdMessage {
  text: string;
  kind: OsdKind;
  // Changes with every message, so the same text shown twice restarts the pill.
  serial: number;
}

// Two slots, each with its own timer. A key message replaces the last key
// message and restarts its timer. The conversion notice holds for its full
// time: a key never cuts it short, and it never cuts a key short.
export function useOsd() {
  const [notice, setNotice] = useState<OsdMessage>();
  const [keyMessage, setKeyMessage] = useState<OsdMessage>();
  const timers = useRef<Record<"key" | "notice", number | undefined>>({ key: undefined, notice: undefined });
  const serial = useRef(0);

  useEffect(() => {
    const held = timers.current;
    return () => {
      window.clearTimeout(held.key);
      window.clearTimeout(held.notice);
    };
  }, []);

  const show = useCallback((text: string, kind: OsdKind = "key") => {
    const slot = kind === "key" ? "key" : "notice";
    window.clearTimeout(timers.current[slot]);
    serial.current += 1;
    const set = slot === "notice" ? setNotice : setKeyMessage;
    set({ text, kind, serial: serial.current });
    timers.current[slot] = window.setTimeout(() => set(undefined), slot === "notice" ? OSD_NOTICE_MS : OSD_MS);
  }, []);

  return { notice, keyMessage, show };
}
