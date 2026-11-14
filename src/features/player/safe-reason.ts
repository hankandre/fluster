import { redactText, redactedErrorMessage } from "../../lib/redact";

const MAX_LENGTH = 300;
const ADDRESS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"')\]]*/gi;
const WINDOWS_PATH = /\b[A-Za-z]:\\[^\s"'),;]*/g;
const HOME_PATH = /~\/[^\s"'),;]*/g;
const POSIX_PATH = /(?<![\w:.\]])\/[^\s/"'),;]+(?:\/[^\s/"'),;]+)+/g;

// The only way a player failure reason reaches the screen. Native errors carry
// third-party text, so beyond redaction this hides addresses and file paths.
export function safeReason(value: string): string {
  const text = redactText(value)
    .replace(ADDRESS, "[address]")
    .replace(WINDOWS_PATH, "[path]")
    .replace(HOME_PATH, "[path]")
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
