// A Jellyfin server that answered LAN discovery (UDP 7359). The native side
// has already checked `address` against the URL policy; choosing it still
// runs the public-info probe and, for plain HTTP to a private-LAN host, the
// unencrypted-connection confirmation (docs/decisions/0001).
export interface DiscoveredServer {
  name: string;
  id: string;
  address: string;
}

// Port for finding servers on the local network. Only the desktop shell has
// one; browser development mode cannot send UDP.
export interface ServerDiscovery {
  discover(): Promise<DiscoveredServer[]>;
}

export const DISCOVERY_FAILED_MESSAGE = "Fluster could not search this network for servers.";
