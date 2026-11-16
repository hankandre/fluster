import { redactText, redactedErrorMessage } from "./redact";

const MAX_LENGTH = 300;
// Each pattern starts only at a token start (a lookbehind, not \b) so matching
// stays linear on long input.
const ADDRESS = /(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/(?:[^\s"')\[\]]*\[[^\]\s]*\])?(?:\[redacted\]|[^\s"')\]])*/gi;
const UNC_PATH = /\\\\[^\s"'),;]+/g;
const WINDOWS_PATH = /\b[A-Za-z]:[\\/][^\s"'),;]*/g;
const HOME_PATH = /~\/[^\s"'),;]*/g;
const HOST_PORT =
  /(?<![\w.-])(?:\[[0-9a-f:.%]+\]|\d{1,3}(?:\.\d{1,3}){3}|localhost|(?:[a-z0-9-]+\.)+[a-z]{2,}|[a-z][a-z0-9-]*(?=:\d{4,5}\b)):\d{1,5}\b/gi;
const POSIX_PATH = /(?<![\w:.\]\/])\/+[^\s/"'),;]+(?:\/[^\s/"'),;]*)*/g;

// The only way a player failure reason reaches the screen. Native errors carry
// third-party text, so beyond redaction this hides addresses and file paths.
export function safeReason(value: string): string {
  const text = redactText(value)
    .replace(ADDRESS, "[address]")
    .replace(UNC_PATH, "[path]")
    .replace(WINDOWS_PATH, "[path]")
    .replace(HOME_PATH, "[path]")
    .replace(HOST_PORT, "[address]")
    .replace(POSIX_PATH, "[path]")
    .trim();
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}

// Reads any player failure (string, Error, or other) one way, through
// safeReason, and gives `fallback` when it has no text.
export function errorReason(error: unknown, fallback: string): string {
  const text = safeReason(redactedErrorMessage(error));
  return text ? text : fallback;
}
