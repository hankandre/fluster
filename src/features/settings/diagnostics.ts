import type { HostClass } from "../../domain/host-class";
import { redactText } from "../../lib/redact";

const UNKNOWN = "Unknown";
const MAX_VALUE_LENGTH = 80;
const SERVER_VERSION = /^\d{1,4}(\.\d{1,4}){1,3}$/;

// What Copy diagnostics may hold (Q24 B). There is no field for the server name, address, user, token, or
// session id, so none of them can reach the text.
export interface DiagnosticsInput {
  appVersion: string;
  os: string;
  player:
    | { kind: "native"; libmpvVersion?: string; renderer?: string }
    | { kind: "browser" }
    | { kind: "checking" }
    | { kind: "unavailable" };
  decode?: { mode: "hardware" | "software"; hwdec?: string };
  serverVersion?: string;
  hostClass: HostClass;
}

// Free text from the player or the platform, shown only after redaction. Anything that still looks like a URL is hidden.
export function safeValue(value: string | undefined): string {
  if (!value || !value.trim()) return UNKNOWN;
  if (value.includes("://")) return "Hidden";
  const flat = redactText(value).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
  if (!flat) return UNKNOWN;
  return flat.length > MAX_VALUE_LENGTH ? flat.slice(0, MAX_VALUE_LENGTH) : flat;
}

// The server's version, only when it is plain dotted numbers.
export function safeServerVersion(value: string | undefined): string {
  return value !== undefined && SERVER_VERSION.test(value) ? value : UNKNOWN;
}

// mpv reports its version as "mpv 0.41.0"; the screen and the report name libmpv themselves.
export function libmpvVersionText(version: string | undefined): string {
  return safeValue(version?.replace(/^\s*mpv\s+/i, ""));
}

// A coarse platform name. The user-agent string itself is never shown.
export function osName(userAgent: string): string {
  if (/Android/.test(userAgent)) return "Android";
  if (/Linux/.test(userAgent)) return "Linux";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "macOS";
  if (/Windows/.test(userAgent)) return "Windows";
  return UNKNOWN;
}

// The same split as the streaming limits: loopback and private networks are local.
export function hostLabel(hostClass: HostClass): string {
  return hostClass === "public" ? "remote" : "local network";
}

function playerLine(player: DiagnosticsInput["player"]): string {
  switch (player.kind) {
    case "native":
      return `Player: native, libmpv ${libmpvVersionText(player.libmpvVersion)}`;
    case "browser":
      return "Player: browser (development)";
    case "checking":
      return "Player: checking";
    case "unavailable":
      return "Player: unavailable";
  }
}

function decodeLine(decode: DiagnosticsInput["decode"]): string {
  if (!decode) return "Decode: no playback yet";
  if (decode.mode === "software") return "Decode: software";
  return decode.hwdec ? `Decode: hardware (${safeValue(decode.hwdec)})` : "Decode: hardware";
}

// Exactly seven lines, each with a fixed prefix.
export function diagnosticsText(input: DiagnosticsInput): string {
  const renderer = input.player.kind === "native" ? safeValue(input.player.renderer) : "none";
  return [
    `Fluster ${safeValue(input.appVersion)}`,
    `OS: ${safeValue(input.os)}`,
    playerLine(input.player),
    `Renderer: ${renderer}`,
    decodeLine(input.decode),
    `Jellyfin: ${safeServerVersion(input.serverVersion)}`,
    `Server: ${hostLabel(input.hostClass)}`,
  ].join("\n");
}
