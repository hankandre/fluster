import { invoke } from "@tauri-apps/api/core";
import { DISCOVERY_FAILED_MESSAGE, type DiscoveredServer, type ServerDiscovery } from "../../domain/server-discovery";

// Rust returns at most 16 servers; anything beyond that is not trusted.
const MAX_SERVERS = 16;

function isDiscoveredServer(value: unknown): value is DiscoveredServer {
  if (typeof value !== "object" || value === null) return false;
  const server = value as Record<string, unknown>;
  return typeof server.name === "string" && typeof server.id === "string" && typeof server.address === "string";
}

// Calls the read-only `discover_servers` command. Errors are replaced with
// fixed text so nothing from the network or the IPC layer reaches the UI.
export class NativeServerDiscovery implements ServerDiscovery {
  async discover(): Promise<DiscoveredServer[]> {
    let result: unknown;
    try {
      result = await invoke("discover_servers");
    } catch {
      throw new Error(DISCOVERY_FAILED_MESSAGE);
    }
    if (!Array.isArray(result)) throw new Error(DISCOVERY_FAILED_MESSAGE);
    return result
      .filter(isDiscoveredServer)
      .slice(0, MAX_SERVERS)
      .map(({ name, id, address }) => ({ name, id, address }));
  }
}
