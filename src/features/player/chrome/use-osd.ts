import { useCallback, useEffect, useRef, useState } from "react";
import { OSD_MS, OSD_NOTICE_MS } from "./timing";

export type OsdKind = "key" | "notice";

export interface OsdMessage {
  text: string;
  kind: OsdKind;
  // Changes with every message, so the same text shown twice restarts the pill.
  serial: number;
}

// One message at a time: a new one replaces the old and restarts the timer.
export function useOsd() {
  const [message, setMessage] = useState<OsdMessage>();
  const timer = useRef<number | undefined>(undefined);
  const serial = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = useCallback((text: string, kind: OsdKind = "key") => {
    window.clearTimeout(timer.current);
    serial.current += 1;
    setMessage({ text, kind, serial: serial.current });
    timer.current = window.setTimeout(() => setMessage(undefined), kind === "notice" ? OSD_NOTICE_MS : OSD_MS);
  }, []);

  return { message, show };
}
