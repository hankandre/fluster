import { useEffect, useRef, useState } from "react";
import {
  DISCOVERY_FAILED_MESSAGE,
  type DiscoveredServer,
  type ServerDiscovery,
} from "../../domain/server-discovery";

type DiscoveryState =
  | { name: "idle" }
  | { name: "searching" }
  | { name: "found"; servers: DiscoveredServer[] }
  | { name: "failed" };

// "Find servers on this network": asks the desktop shell to broadcast
// Jellyfin's discovery datagram and lists the servers that answered.
// Choosing one hands its address to the normal connect flow.
export function ServerDiscoveryPanel({
  discovery,
  disabled,
  onChoose,
}: {
  discovery: ServerDiscovery;
  disabled: boolean;
  onChoose: (address: string) => void;
}) {
  const [state, setState] = useState<DiscoveryState>({ name: "idle" });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function search() {
    setState({ name: "searching" });
    try {
      const servers = await discovery.discover();
      if (mounted.current) setState({ name: "found", servers });
    } catch {
      // The adapter already uses fixed text; never show anything else.
      if (mounted.current) setState({ name: "failed" });
    }
  }

  const searching = state.name === "searching";

  return (
    <section className="server-discovery" aria-labelledby="server-discovery-title">
      <h2 id="server-discovery-title" className="kicker">On this network</h2>
      <button type="button" className="text-button" disabled={searching || disabled} onClick={search}>
        {searching ? "Searching…" : "Find servers on this network"}
      </button>
      {searching && <p role="status">Looking for Jellyfin servers on this network…</p>}
      {state.name === "failed" && <p role="alert" className="form-error">{DISCOVERY_FAILED_MESSAGE}</p>}
      {state.name === "found" && state.servers.length === 0 && (
        <p role="status">
          No servers answered. The server may be on another network or have discovery turned off. Enter its address above.
        </p>
      )}
      {state.name === "found" && state.servers.length > 0 && (
        <ul className="discovered-servers" aria-label="Servers found on this network">
          {state.servers.map((server) => (
            <li key={server.id}>
              <button
                type="button"
                className="discovered-server"
                disabled={disabled}
                onClick={() => onChoose(server.address)}
              >
                <span className="discovered-server-name">{server.name}</span>
                <span className="discovered-server-address">{server.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
