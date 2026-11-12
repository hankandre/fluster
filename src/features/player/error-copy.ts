import type { TransportErrorKind } from "../../lib/transport-error";
import { REPORT_FAILED_WARNING } from "../../lib/player/playstate-reporter";
import { safeReason } from "./safe-reason";

// What the server is called when the app does not know its name yet.
export const UNKNOWN_SERVER_NAME = "your server";

// DESIGN.md 10. A failed request never shows its own message, only these.
export function playbackErrorCopy(message: string, kind: TransportErrorKind | undefined, serverName: string): string {
  switch (kind) {
    case "network":
      return `Couldn't reach ${serverName}. Check that the server is on, then try again.`;
    case "server":
      return `${serverName} had a problem starting playback. Try again in a moment.`;
    case "request":
      return "Something went wrong starting playback. Try again.";
    case undefined:
      return safeReason(message);
  }
}

// The reporting warning: report failures get plain copy; the app's own
// shutdown-deadline texts pass through safeReason.
export function reportingWarningCopy(warning: string, serverName: string): string {
  if (warning === REPORT_FAILED_WARNING) return `Couldn't save your progress to ${serverName}. Playback continues.`;
  return `Jellyfin progress reporting failed: ${safeReason(warning)}`;
}
