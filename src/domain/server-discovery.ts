// One reply to LAN discovery (UDP 7359). The native side has already checked
// `address` against the URL policy. Any device on the network can reply, so
// a reply is a hint, not an identity: choosing it runs the public-info probe,
// which must report the same `id`, and, for plain HTTP to a private-LAN
// host, the unencrypted-connection confirmation (docs/decisions/0001).
export interface DiscoveredServer {
  name: string;
  id: string;
  address: string;
  // The IPv4 address the reply came from.
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
