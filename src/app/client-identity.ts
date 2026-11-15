import { osName } from "../features/settings/diagnostics";
import type { ClientIdentity } from "../lib/jellyfin/gateway";

// The server lists this name for the device. It is one of a fixed set of
// literals, so no host name, user name, or user-agent text reaches it.
export function deviceNameFor(userAgent: string): string {
  switch (osName(userAgent)) {
    case "Linux":
      return "Fluster Linux";
    case "macOS":
      return "Fluster macOS";
    case "Windows":
      return "Fluster Windows";
    default:
      return "Fluster";
  }
}

export function clientIdentity(): ClientIdentity {
  return { version: __APP_VERSION__, deviceName: deviceNameFor(navigator.userAgent) };
}
