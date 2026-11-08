// One reply to LAN discovery (UDP 7359). The native side has already checked
// `address` against the URL policy. Any device on the network can reply and
// can copy a server's public Id, so a reply is a hint, not an identity:
// choosing it runs the public-info probe, which must report the same `id`
// (this catches only an address that points at a different real server),
// and, for plain HTTP to a private-LAN host, the unencrypted-connection
// confirmation (docs/decisions/0001). The origin shown on the sign-in steps
// is what lets the user notice an unexpected server.
export interface DiscoveredServer {
  name: string;
  id: string;
  address: string;
  // The UDP source address the reply claims. It can be spoofed on a LAN, so
  // it is a hint for the user, never authentication.
  advertisedBy: string;
  // False when the address points somewhere other than the sender.
  addressIsSender: boolean;
  // True when another reply named the same id with a different address.
  conflicting: boolean;
}

export interface DiscoveryResult {
  servers: DiscoveredServer[];
  // Replies whose address Fluster refused (ADR 0001 decision 9).
  refused: number;
  // Allowed replies that did not fit in the list.
  dropped: number;
}

// Port for finding servers on the local network. Only the desktop shell has
// one; browser development mode cannot send UDP.
export interface ServerDiscovery {
  discover(): Promise<DiscoveryResult>;
}

export const DISCOVERY_FAILED_MESSAGE = "Fluster could not search this network for servers.";
export const DISCOVERED_ID_MISMATCH_MESSAGE =
  "The server at this address is not the one that answered on your network. Fluster did not connect. Enter the server's address yourself.";

// Jellyfin reports the same system id in discovery and /System/Info/Public;
// compare without case or dashes.
export function sameServerId(discovered: string, probed: string | undefined): boolean {
  if (!probed) return false;
  const normalize = (id: string) => id.toLowerCase().replaceAll("-", "");
  return normalize(discovered) === normalize(probed);
}
