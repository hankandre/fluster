import { useEffect, useId, useState } from "react";
import type { PlaybackSnapshot } from "../../domain/playback";
import { redactText } from "../../lib/redact";
import type { PlayerStatus } from "./player-status";

// Today only direct play is negotiated; DirectStream and Transcode are here so
// the panel needs no rework when the fallback (P10-06) arrives.
export type PlayMethod = "DirectPlay" | "DirectStream" | "Transcode";

const PLAY_METHOD_LABEL: Record<PlayMethod, string> = {
  DirectPlay: "Direct play",
  DirectStream: "Direct stream",
  Transcode: "Transcode",
};

const UNKNOWN = "Unknown";

// Player-supplied text is shown only after redaction, and anything that still
// looks like a URL is replaced: the panel never shows one.
function plain(value: string | undefined): string {
  if (!value) return UNKNOWN;
  if (value.includes("://")) return "Hidden";
  return redactText(value);
}

function playerLine(status: PlayerStatus): string {
  switch (status.kind) {
    case "checking":
      return "Checking…";
    case "unavailable":
      return "Native player cannot start";
    case "ready":
      if (status.capabilities.mode === "browser") return "Browser — unverified";
      return `Native, libmpv ${plain(status.capabilities.libmpvVersion)}`;
  }
}

function decodeLine(snapshot: PlaybackSnapshot | undefined): string {
  const diagnostics = snapshot?.diagnostics;
  if (!diagnostics) return "Not playing yet";
  return plain(diagnostics.decodeLabel);
}

function hwdecLine(snapshot: PlaybackSnapshot | undefined): string {
  const diagnostics = snapshot?.diagnostics;
  if (!diagnostics) return "Not playing yet";
  if (!diagnostics.hwdecCurrent) return diagnostics.decodeMode === "software" ? "None (software)" : UNKNOWN;
  return diagnostics.hwdecInterop
    ? `${plain(diagnostics.hwdecCurrent)} via ${plain(diagnostics.hwdecInterop)}`
    : plain(diagnostics.hwdecCurrent);
}

export function PlayerInfoPanel({ status, snapshot, playMethod = "DirectPlay" }: {
  status: PlayerStatus;
  snapshot: PlaybackSnapshot | undefined;
  playMethod?: PlayMethod;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // "i" toggles, unless the user is typing or the key carries a modifier.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "i" || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || target.closest("input, textarea, select")) return;
      }
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const renderer = status.kind === "ready" ? plain(status.capabilities.renderer) : UNKNOWN;
  return (
    <div className="player-info">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        Info
      </button>
      <section id={panelId} aria-label="Player information" hidden={!open}>
        <dl>
          <dt>Player</dt>
          <dd>{playerLine(status)}</dd>
          <dt>Renderer</dt>
          <dd>{renderer}</dd>
          <dt>Decode mode</dt>
          <dd>{decodeLine(snapshot)}</dd>
          <dt>Hardware decoder</dt>
          <dd>{hwdecLine(snapshot)}</dd>
          <dt>Play method</dt>
          <dd>{PLAY_METHOD_LABEL[playMethod]}</dd>
        </dl>
        {status.kind === "unavailable" && <p role="alert">{plain(status.reason)}</p>}
      </section>
    </div>
  );
}
