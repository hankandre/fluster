import { useEffect } from "react";
import type { PlaybackDiagnostics } from "../../domain/playback";

// How the last playback decoded, kept in memory for the Settings diagnostics. It holds the mode and the
// hardware decoder name only: no title, item id, URL, or session id. It is gone after a restart.
export interface LastDecode {
  mode: "hardware" | "software";
  hwdec?: string;
}

let last: LastDecode | undefined;

export function lastDecode(): LastDecode | undefined {
  return last;
}

export function recordDecode(diagnostics: PlaybackDiagnostics | undefined): void {
  if (!diagnostics) return;
  if (diagnostics.decodeMode === "hardware") {
    last = diagnostics.hwdecCurrent ? { mode: "hardware", hwdec: diagnostics.hwdecCurrent } : { mode: "hardware" };
  } else if (diagnostics.decodeMode === "software") {
    last = { mode: "software" };
  }
}

export function resetLastDecode(): void {
  last = undefined;
}

export function useRecordDecode(diagnostics: PlaybackDiagnostics | undefined): void {
  useEffect(() => {
    recordDecode(diagnostics);
  }, [diagnostics]);
}
