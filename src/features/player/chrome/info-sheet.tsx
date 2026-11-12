import { useRef } from "react";
import type { PlaybackSnapshot, PlayMethod } from "../../../domain/playback";
import { redactText } from "../../../lib/redact";
import { Button } from "../../shared/ui";
import { BURNED_IN_COPY, type ConversionIndicator } from "../conversion-copy";
import type { ReadyPlayerStatus } from "../player-status";
import { PlayerSheet } from "./player-sheet";

const PLAY_METHOD_LABEL: Record<PlayMethod, string> = {
  DirectPlay: "Direct play",
  DirectStream: "Direct stream",
  Transcode: "Transcode",
};

const UNKNOWN = "Unknown";

// Player-supplied text is shown only after redaction, and anything that still
// looks like a URL is replaced: the sheet never shows one.
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

// What Play original needs: whether to offer it, and whether the server still
// converts after it was asked for.
export interface PlayOriginalState {
  available: boolean;
  stillConverting: boolean;
  onPlay(): void;
}

// The Info side sheet. Playback facts come only from the plan: before the
// server has answered, no play method is named and nothing claims the original
// file. Opened with the conversion chip, focus starts on Play original (when
// offered); opened with the key, on Close, so Space cannot start a new session.
export function InfoSheet({ id, status, snapshot, playMethod, indicator, playOriginal, focusPlayOriginal = false, onClose }: {
  id?: string;
  status: ReadyPlayerStatus;
  snapshot: PlaybackSnapshot | undefined;
  playMethod?: PlayMethod;
  indicator?: ConversionIndicator;
  playOriginal?: PlayOriginalState;
  focusPlayOriginal?: boolean;
  onClose(): void;
}) {
  const playOriginalButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const renderer = plain(status.capabilities.renderer);
  const showButton = Boolean(playOriginal?.available);

  const play = () => {
    // The button goes away as the new session starts; keep focus in the sheet.
    closeButton.current?.focus();
    playOriginal?.onPlay();
  };

  return (
    <PlayerSheet
      id={id}
      label="Player information"
      title="Info"
      onClose={onClose}
      closeRef={closeButton}
      initialFocus={focusPlayOriginal && showButton ? playOriginalButton : "close"}
    >
      <section className="player-sheet-section">
        <h3>Playback</h3>
        <dl>
          {playMethod && (
            <>
              <dt>Play method</dt>
              <dd>{PLAY_METHOD_LABEL[playMethod]}</dd>
            </>
          )}
          {indicator ? (
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
          ) : playMethod === "DirectPlay" ? (
            <>
              <dt>Source</dt>
              <dd className="player-ok">Original file</dd>
            </>
          ) : null}
        </dl>
        {showButton && (
          <Button ref={playOriginalButton} variant="secondary" onClick={play}>Play original</Button>
        )}
        {playOriginal?.stillConverting && <p role="status">The server still converts this.</p>}
      </section>
      <section className="player-sheet-section">
        <h3>Decoder</h3>
        <dl>
          <dt>Decode mode</dt>
          <dd>{decodeLine(snapshot)}</dd>
          <dt>Hardware decoder</dt>
          <dd>{hwdecLine(snapshot)}</dd>
        </dl>
      </section>
      <section className="player-sheet-section">
        <h3>Renderer</h3>
        <dl>
          <dt>Player</dt>
          <dd>{playerLine(status)}</dd>
          <dt>Renderer</dt>
          <dd>{renderer}</dd>
        </dl>
      </section>
    </PlayerSheet>
  );
}
