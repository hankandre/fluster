import { useState, type ReactNode } from "react";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackSnapshot } from "../../domain/playback";
import { CONVERSION_REASON_COPY, type ConversionIndicator } from "../player/conversion-copy";
import { InfoSheet } from "../player/chrome/info-sheet";
import { Osd } from "../player/chrome/osd";
import { PlayerLoading } from "../player/chrome/player-loading";
import { SkipButton } from "../player/chrome/skip-button";
import { UpNextCard } from "../player/chrome/up-next-card";
import { PlayerTopBar } from "../player/chrome/player-top-bar";
import type { ReadyPlayerStatus } from "../player/player-status";
import { Button } from "../shared/ui";
import "../player/chrome/player.css";

// The browser engine refuses conversions, so the states that need one are
// drawn here from their parts. Browser development only, like the gallery.
const EPISODE: LibraryItem = {
  id: "gallery-episode",
  name: "The Keeper's Log",
  type: "Episode",
  seriesName: "Harbor Lights",
  season: 1,
  episode: 2,
  resumePositionTicks: 0,
  played: false,
};

const STATUS: ReadyPlayerStatus = {
  kind: "ready",
  capabilities: { mode: "native", embedded: true, renderer: "OpenGL", nativeRenderer: "gl", libmpvVersion: "mpv 0.38.0" },
};

const SNAPSHOT: PlaybackSnapshot = {
  positionSeconds: 1200,
  durationSeconds: 3000,
  paused: false,
  buffering: false,
  volume: 80,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware decoding", hwdecCurrent: "vaapi", hwdecInterop: "vaapi-egl", droppedFrames: 0 },
};

const REASON = CONVERSION_REASON_COPY.ContainerBitrateExceedsLimit;
const INDICATOR: ConversionIndicator = {
  chip: `Converting on server: ${REASON}`,
  reasons: [REASON],
  subtitlesBurnedIn: true,
};

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery-player-frame" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function PlayerChromeGallery() {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <section className="gallery-section" aria-label="Player chrome">
      <h2>Player chrome</h2>
      <div className="gallery-row">
        <Frame label="Top bar with a conversion chip">
          <div className="player-chrome" data-visible="true">
            <div className="player-shade" />
            <PlayerTopBar item={EPISODE} indicator={INDICATOR} onBack={() => undefined} onOpenInfo={() => undefined} />
          </div>
        </Frame>
        <Frame label="Info sheet with Play original">
          <Button variant="secondary" onClick={() => setInfoOpen(true)}>Open Info sheet</Button>
          {infoOpen && (
            <InfoSheet
              status={STATUS}
              snapshot={SNAPSHOT}
              playMethod="Transcode"
              indicator={INDICATOR}
              playOriginal={{ available: true, stillConverting: true, onPlay: () => undefined }}
              onClose={() => setInfoOpen(false)}
            />
          )}
        </Frame>
        <Frame label="Conversion notice">
          <Osd message={{ text: INDICATOR.chip, kind: "notice", serial: 1 }} />
        </Frame>
        <Frame label="Skip intro">
          <div className="player-skip" data-chrome-visible="true">
            <SkipButton segment={{ kind: "Intro", startSeconds: 10, endSeconds: 70 }} onSkip={() => undefined} />
          </div>
        </Frame>
        <Frame label="Up next, paused with 7 seconds left">
          <div className="player-prompt" data-chrome-visible="false">
            <UpNextCard
              next={{ id: "gallery-next", title: "The Lamp Room", label: "S1 · E3" }}
              secondsLeft={7}
              totalSeconds={10}
              paused
              onPlayNow={() => undefined}
              onHide={() => undefined}
            />
          </div>
        </Frame>
        <Frame label="Loading a conversion">
          <PlayerLoading title="S1 · E2 The Keeper's Log" seriesLine="Harbor Lights" text={`${INDICATOR.chip}…`} onBack={() => undefined} />
        </Frame>
      </div>
    </section>
  );
}
