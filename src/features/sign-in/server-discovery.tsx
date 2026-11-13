import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { DISCOVERY_FAILED_MESSAGE, type DiscoveredServer } from "../../domain/server-discovery";
import { useRovingFocus } from "../roving-focus";
import { Button, InlineError, Skeleton } from "../shared/ui";
import type { ServerSearch } from "./use-server-discovery";

export const REFUSED_REPLY_MESSAGE = "A server answered with an address Fluster won't use over plain HTTP.";
export const DROPPED_REPLY_MESSAGE = "More servers answered than Fluster can list.";

// Servers found on the local network. Any device can reply, so each row shows
// the sender it claims (a hint, not proof) and flags conflicts. Choosing one
// hands it to the normal connect flow, which checks the probed Id.
export function ServerList({
  search,
  busy,
  onChoose,
  focusOnResult,
}: {
  search: ServerSearch;
  busy: boolean;
  onChoose: (server: DiscoveredServer) => void;
  // TV form: when results arrive, focus the first server, else "Search again".
  focusOnResult?: boolean;
}) {
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const roving = useRovingFocus<HTMLUListElement>("column");
  const { state } = search;
  const searching = state.name === "searching";
  const servers = state.name === "found" ? state.result.servers : [];
  const refused = state.name === "found" ? state.result.refused : 0;
  const dropped = state.name === "found" ? state.result.dropped : 0;

  const section = useRef<HTMLElement>(null);
  const resultName = state.name;
  useEffect(() => {
    if (!focusOnResult || (resultName !== "found" && resultName !== "failed")) return;
    const target = section.current?.querySelector<HTMLElement>(".sign-in-server") ?? section.current?.querySelector<HTMLElement>("button");
    target?.focus();
  }, [focusOnResult, resultName]);

  // The retry buttons unmount when a search starts; keep focus in the section.
  function searchAgain() {
    title.current?.focus();
    search.searchAgain();
  }

  return (
    <section className="sign-in-discovery" aria-labelledby={titleId} ref={section}>
      <h2 id={titleId} ref={title} tabIndex={-1} className="sign-in-section-title">On this network</h2>
      {searching && (
        <>
          <p role="status" className="sign-in-note">Looking for Jellyfin servers on this network…</p>
          <Skeleton height="var(--control-h)" />
        </>
      )}
      {state.name === "failed" && (
        <InlineError message={DISCOVERY_FAILED_MESSAGE} onRetry={searchAgain} retryLabel="Search again" />
      )}
      {state.name === "found" && servers.length === 0 && refused === 0 && (
        <p role="status" className="sign-in-note">
          No servers answered. The server may be on another network or have discovery turned off. Enter its address below.
        </p>
      )}
      {refused > 0 && <p role="status" className="sign-in-warning"><TriangleAlert aria-hidden="true" size={16} />{REFUSED_REPLY_MESSAGE}</p>}
      {dropped > 0 && <p role="status" className="sign-in-warning"><TriangleAlert aria-hidden="true" size={16} />{DROPPED_REPLY_MESSAGE}</p>}
      {servers.length > 0 && (
        <ul
          className="sign-in-servers"
          aria-label="Servers found on this network"
          ref={roving.ref}
          onKeyDown={roving.onKeyDown}
          onFocus={roving.onFocus}
        >
          {servers.map((server) => (
            <li key={`${server.id} ${server.address}`}>
              <button
                type="button"
                className="sign-in-server"
                data-roving-item=""
                aria-disabled={busy ? true : undefined}
                onClick={() => {
                  if (!busy) onChoose(server);
                }}
              >
                <span className="sign-in-server-name">{server.name}</span>
                <span className="sign-in-server-address">{server.address}</span>
                <span className="sign-in-server-sender">
                  Advertised by {server.advertisedBy}
                  {!server.addressIsSender && " · address points to another device"}
                </span>
                {server.conflicting && (
                  <span className="sign-in-server-conflict">
                    <TriangleAlert aria-hidden="true" size={16} />
                    Conflict: more than one device claims to be this server. Check the address before you connect.
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(state.name === "found") && (
        <Button variant="quiet" onClick={searchAgain}>Search again</Button>
      )}
      {searching && <Button variant="quiet" disabled>Searching…</Button>}
    </section>
  );
}
