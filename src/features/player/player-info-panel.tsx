import { useEffect, useId, useState } from "react";
import type { PlaybackSnapshot, PlayMethod } from "../../domain/playback";
import { redactText } from "../../lib/redact";
import { TEXT_FIELDS } from "../use-escape-key";
import { BURNED_IN_COPY, type ConversionIndicator } from "./conversion-copy";
import type { ReadyPlayerStatus } from "./player-status";

// The plan carries its method since P10-03; the player route passes it.
export type { PlayMethod };

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

function playerLine(status: ReadyPlayerStatus): string {
  if (status.capabilities.mode === "browser") return "Browser — unverified";
  return `Native, libmpv ${plain(status.capabilities.libmpvVersion)}`;
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

export function PlayerInfoPanel({ status, snapshot, playMethod = "DirectPlay", indicator }: {
  status: ReadyPlayerStatus;
  snapshot: PlaybackSnapshot | undefined;
  playMethod?: PlayMethod;
  indicator?: ConversionIndicator;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // "i" toggles, unless the user is typing or the key carries a modifier.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "i" || event.repeat || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || target.matches(`${TEXT_FIELDS}, select`)) return;
      }
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const renderer = plain(status.capabilities.renderer);
  return (
    <div className="player-info" data-open={open}>
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
          {indicator && (
            <>
              <dt>Why</dt>
              <dd>{indicator.reasons.join("; ")}</dd>
              {indicator.subtitlesBurnedIn && (
                <>
                  <dt>Subtitles</dt>
                  <dd>{BURNED_IN_COPY}</dd>
                </>
              )}
            </>
          )}
        </dl>
      </section>
    </div>
  );
}
