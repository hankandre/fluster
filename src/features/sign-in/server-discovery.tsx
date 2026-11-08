import { useEffect, useRef, useState } from "react";
import {
  DISCOVERY_FAILED_MESSAGE,
  type DiscoveredServer,
  type DiscoveryResult,
  type ServerDiscovery,
} from "../../domain/server-discovery";

export const REFUSED_REPLY_MESSAGE = "A server answered with an address Fluster won't use over plain HTTP.";

type DiscoveryState =
  | { name: "idle" }
  | { name: "searching" }
  | { name: "found"; result: DiscoveryResult }
  | { name: "failed" };

// "Find servers on this network": asks the desktop shell to broadcast
// Jellyfin's discovery datagram and lists the replies. Any device can
// reply, so each entry shows who sent it and flags conflicts. Choosing one
// hands it to the normal connect flow, which checks the probed Id.
export function ServerDiscoveryPanel({
  discovery,
  disabled,
  onChoose,
}: {
  discovery: ServerDiscovery;
  disabled: boolean;
  onChoose: (server: DiscoveredServer) => void;
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
      const result = await discovery.discover();
      if (mounted.current) setState({ name: "found", result });
    } catch {
      // The adapter already uses fixed text; never show anything else.
      if (mounted.current) setState({ name: "failed" });
    }
  }

  const searching = state.name === "searching";
  const servers = state.name === "found" ? state.result.servers : [];
  const refused = state.name === "found" ? state.result.refused : 0;

  return (
    <section className="server-discovery" aria-labelledby="server-discovery-title">
      <h2 id="server-discovery-title" className="kicker">On this network</h2>
      <button type="button" className="text-button" disabled={searching || disabled} onClick={search}>
        {searching ? "Searching…" : "Find servers on this network"}
      </button>
      {searching && <p role="status">Looking for Jellyfin servers on this network…</p>}
      {state.name === "failed" && <p role="alert" className="form-error">{DISCOVERY_FAILED_MESSAGE}</p>}
      {state.name === "found" && servers.length === 0 && refused === 0 && (
        <p role="status">
          No servers answered. The server may be on another network or have discovery turned off. Enter its address above.
        </p>
      )}
      {refused > 0 && <p role="status" className="form-error">{REFUSED_REPLY_MESSAGE}</p>}
      {servers.length > 0 && (
        <ul className="discovered-servers" aria-label="Servers found on this network">
          {servers.map((server) => (
            <li key={`${server.id} ${server.address}`}>
              <button
                type="button"
                className="discovered-server"
                disabled={disabled}
                onClick={() => onChoose(server)}
              >
                <span className="discovered-server-name">{server.name}</span>
                <span className="discovered-server-address">{server.address}</span>
                <span className="discovered-server-sender">
                  Advertised by {server.advertisedBy}
                  {!server.addressIsSender && " · address points to another device"}
                </span>
                {server.conflicting && (
                  <span className="discovered-server-warning">
                    Conflict: more than one device claims to be this server. Check the address before you connect.
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
