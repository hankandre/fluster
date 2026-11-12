import { redactText } from "../lib/redact";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LibraryItem } from "../domain/catalog";
import type { PlayerEngine, PlayMethod } from "../domain/playback";
import type { TrackKind } from "../domain/track-choice";
import { activeSegment, type MediaSegment } from "../domain/media-segments";
import type { PlaybackSessionState } from "../lib/player/session-state";
import { type ConversionIndicator } from "../features/player/conversion-copy";
import type { ReadyPlayerStatus } from "../features/player/player-status";
import { InfoSheet, type PlayOriginalState } from "../features/player/chrome/info-sheet";
import { conversionCopy } from "../features/player/chrome/osd-copy";
import { Osd } from "../features/player/chrome/osd";
import { CommandErrorPanel, PlayerWarnings } from "../features/player/chrome/player-error";
import { PlayerLoading, type LoadingBackdrop } from "../features/player/chrome/player-loading";
import { PlayerStatus } from "../features/player/chrome/player-status";
import { PlayerTopBar, titleLine } from "../features/player/chrome/player-top-bar";
import type { SeekChapter } from "../features/player/chrome/player-time";
import { SkipButton } from "../features/player/chrome/skip-button";
import { Scrubber } from "../features/player/chrome/scrubber";
import { TrackPanel } from "../features/player/chrome/track-panel";
import type { ConvertedTracks } from "../features/player/chrome/track-options";
import { TransportControls } from "../features/player/chrome/transport-controls";
import { CHROME_ZONE_ATTRIBUTE, useChromeVisibility } from "../features/player/chrome/use-chrome-visibility";
import { useFullscreen } from "../features/player/chrome/use-fullscreen";
import { useOsd } from "../features/player/chrome/use-osd";
import { seekTarget, usePlayerKeys, type SheetName } from "../features/player/chrome/use-player-keys";
import "../features/player/chrome/player.css";
import { PlaybackErrorNotice } from "../features/player/playback-notices";
import { UNKNOWN_SERVER_NAME } from "../features/player/error-copy";
import { NativeVideoSurface } from "./NativeVideoSurface";

export type { SeekChapter };

// What PlayerLoading says before the first frame (DESIGN.md 10).
function loadingText(playMethod: PlayMethod | undefined, indicator: ConversionIndicator | undefined): string {
  if (!playMethod) return "Loading…";
  return indicator ? `${indicator.chip}…` : "Opening the original file…";
}

export function PlayerView({
  item,
  player,
  session,
  status,
  segments,
  serverName = UNKNOWN_SERVER_NAME,
  retrying,
  onRetry,
  onBack,
  onBackToDetails,
  seekPreview,
  chapters,
  convertedTracks,
  onChangeConvertedTrack,
  retryLabel = "Retry",
  playMethod,
  indicator,
  playOriginal,
  backdrop,
  prompt,
  onPlayNext,
}: {
  item: LibraryItem;
  player: PlayerEngine;
  session: PlaybackSessionState;
  // What the app knows about the player, for the Info sheet.
  status: ReadyPlayerStatus;
  // Intro and outro segments to offer a skip button for. Empty or absent shows none.
  segments?: MediaSegment[];
  // The server's display name for error copy.
  serverName?: string;
  retrying?: boolean;
  onRetry(): Promise<void> | void;
  onBack(): Promise<void> | void;
  // Where "Back to details" goes on an error notice; absent, it uses onBack.
  onBackToDetails?(): Promise<void> | void;
  // Both are optional and off by default: without them the seek bar is a bare
  // slider. seekPreview draws the picture shown above the time under the
  // pointer (or the keyboard position); chapters adds markers and names.
  seekPreview?: (seconds: number, frameWidth?: number) => ReactNode;
  chapters?: SeekChapter[];
  // Set for a converted session: the track panel lists the source's streams
  // and a choice goes to onChangeConvertedTrack (undefined: subtitles off),
  // which may start a new conversion. Absent, it lists mpv's tracks.
  convertedTracks?: ConvertedTracks;
  onChangeConvertedTrack?(kind: TrackKind, jellyfinIndex: number | undefined): Promise<void>;
  // The error panel's Retry text ("Back to previous tracks" after a failed track change).
  retryLabel?: string;
  // From the plan; absent until the server has answered.
  playMethod?: PlayMethod;
  indicator?: ConversionIndicator;
  playOriginal?: PlayOriginalState;
  // The art shown while loading.
  backdrop?: LoadingBackdrop;
  // The Up Next card. It sits inside the player so focus in it keeps the chrome up.
  prompt?: ReactNode;
  // Plays the next episode: `n`, and OK on the TV form. Set only while the Up Next card shows.
  onPlayNext?(): void;
}) {
  const [commandError, setCommandError] = useState<string>();
  const [sheet, setSheet] = useState<SheetName>();
  // Counts chip presses: a new press remounts the open Info sheet so focus can move to Play original.
  const [chipPresses, setChipPresses] = useState(0);
  const snapshot = session.snapshot;
  const sessionError = session.error;
  const osd = useOsd();
  const tracksId = useId();
  const infoId = useId();

  useEffect(() => {
    document.documentElement.classList.add("native-playing");
    document.body.classList.add("native-playing");
    return () => {
      document.documentElement.classList.remove("native-playing");
      document.body.classList.remove("native-playing");
    };
  }, []);

  const execute = useCallback(async (operation: () => Promise<void>): Promise<boolean> => {
    try {
      setCommandError(undefined);
      await operation();
      return true;
    } catch (operationError) {
      setCommandError(redactText(operationError instanceof Error ? operationError.message : String(operationError)));
      return false;
    }
  }, []);

  useEffect(() => {
    if (retrying) setCommandError(undefined);
  }, [retrying]);

  const { fullscreen, fullscreenRef, changeFullscreen } = useFullscreen(player, execute);
  const converted = convertedTracks && onChangeConvertedTrack ? { tracks: convertedTracks, onChange: onChangeConvertedTrack } : undefined;

  const toggleSheet = useCallback((name: SheetName) => {
    setSheet((current) => (current === name ? undefined : name));
    setChipPresses(0);
  }, []);
  const closeSheet = useCallback(() => setSheet(undefined), []);
  const openInfoFromChip = () => {
    setChipPresses((count) => count + 1);
    setSheet("info");
  };

  const playing = Boolean(snapshot && !snapshot.paused);
  const visibility = useChromeVisibility({ playing, pinned: Boolean(commandError) || sheet !== undefined });
  const skip = segments && snapshot ? activeSegment(segments, snapshot.positionSeconds) : undefined;

  // A failed session replaces the chrome with a notice, so any open sheet closes.
  useEffect(() => {
    if (sessionError) setSheet(undefined);
  }, [sessionError]);

  usePlayerKeys({
    suspended: Boolean(sessionError),
    player,
    snapshot,
    converted,
    sheet,
    execute,
    changeFullscreen,
    fullscreenRef,
    onBack,
    onToggleSheet: toggleSheet,
    onCloseSheet: closeSheet,
    showOsd: osd.show,
    skipTo: skip?.endSeconds,
    chromeVisible: visibility.visible,
    onPlayNext,
  });

  // The conversion is announced at the start of every converted session, and
  // again when its text changes (the server confirming it only repackages).
  const noticeText = indicator ? conversionCopy(indicator.chip, indicator.subtitlesBurnedIn) : undefined;
  const showOsd = osd.show;
  useEffect(() => {
    if (session.firstFrameReady && noticeText) showOsd(noticeText, "notice");
  }, [session.firstFrameReady, noticeText, showOsd]);

  const chromeShown = session.firstFrameReady || Boolean(commandError);
  const backToDetails = () => void (onBackToDetails ?? onBack)();

  if (sessionError) {
    return (
      <section className="player-page" aria-label="Player" {...visibility.sectionProps}>
        <NativeVideoSurface player={player} onError={setCommandError} />
        <PlaybackErrorNotice
          item={item}
          backdrop={backdrop}
          message={sessionError}
          kind={session.errorKind}
          serverName={serverName}
          retryLabel={retryLabel}
          retrying={retrying}
          onRetry={() => void onRetry()}
          onBack={backToDetails}
        />
      </section>
    );
  }

  return (
    <section className="player-page" aria-label="Player" {...visibility.sectionProps}>
      <NativeVideoSurface player={player} onError={setCommandError} />

      {!chromeShown && (
        <PlayerLoading
          title={titleLine(item)}
          seriesLine={item.type === "Episode" ? item.seriesName : undefined}
          backdrop={backdrop}
          text={loadingText(playMethod, indicator)}
          onBack={() => void onBack()}
        />
      )}
      {commandError && !session.firstFrameReady && <div className="player-cover" />}

      {chromeShown && (
        <div className="player-chrome" data-visible={visibility.visible}>
          <div className="player-shade" />
          <PlayerTopBar item={item} indicator={retrying ? undefined : indicator} onBack={() => void onBack()} onOpenInfo={openInfoFromChip} />
          <footer className="player-controls" data-sheet-open={sheet !== undefined || undefined} {...{ [CHROME_ZONE_ATTRIBUTE]: "" }}>
            <Scrubber
              snapshot={snapshot}
              onSeek={(seconds) => void execute(() => player.seek(seconds))}
              seekPreview={seekPreview}
              chapters={chapters}
            />
            <TransportControls
              snapshot={snapshot}
              fullscreen={fullscreen}
              tracksOpen={sheet === "tracks"}
              infoOpen={sheet === "info"}
              tracksId={tracksId}
              infoId={infoId}
              onTogglePause={() => snapshot && void execute(() => player.setPaused(!snapshot.paused))}
              onSeekBy={(seconds) => snapshot && void execute(() => player.seek(seekTarget(snapshot, seconds)))}
              onToggleMute={() => snapshot && void execute(() => player.setMuted(!snapshot.muted))}
              onVolume={(volume) => void execute(() => player.setVolume(volume))}
              onToggleTracks={() => toggleSheet("tracks")}
              onToggleInfo={() => toggleSheet("info")}
              onToggleFullscreen={() => void changeFullscreen(!fullscreen)}
            />
          </footer>
        </div>
      )}

      {chromeShown && <PlayerStatus text={snapshot?.buffering ? "Buffering…" : undefined} />}
      <Osd notice={osd.notice} keyMessage={osd.keyMessage} />
      {commandError && (
        <CommandErrorPanel
          message={commandError}
          retrying={retrying}
          retryLabel={retryLabel}
          onRetry={() => void onRetry()}
          onBack={backToDetails}
        />
      )}
      {!commandError && (
        <PlayerWarnings softwareDecoding={snapshot?.diagnostics?.decodeMode === "software"} reportingWarning={session.reportingWarning} serverName={serverName} />
      )}

      {skip && (
        <div
          className="player-skip"
          data-chrome-visible={visibility.visible}
          data-sheet-open={sheet !== undefined || undefined}
          {...{ [CHROME_ZONE_ATTRIBUTE]: "" }}
        >
          <SkipButton segment={skip} onSkip={(seconds) => void execute(() => player.seek(seconds))} />
        </div>
      )}
      {prompt && (
        <div
          className="player-prompt"
          data-chrome-visible={visibility.visible}
          data-sheet-open={sheet !== undefined || undefined}
          data-with-skip={skip ? "" : undefined}
          {...{ [CHROME_ZONE_ATTRIBUTE]: "" }}
        >
          {prompt}
        </div>
      )}

      {sheet === "tracks" && (
        <TrackPanel
          id={tracksId}
          snapshot={snapshot}
          converted={converted}
          onSelect={(kind, id) => void execute(() => player.selectTrack(kind, id))}
          onChangeConverted={(change) => void execute(change)}
          onClose={closeSheet}
        />
      )}
      {sheet === "info" && (
        <InfoSheet
          key={chipPresses}
          id={infoId}
          status={status}
          snapshot={snapshot}
          playMethod={playMethod}
          indicator={indicator}
          playOriginal={playOriginal}
          focusPlayOriginal={chipPresses > 0}
          onClose={closeSheet}
        />
      )}
    </section>
  );
}
