import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LibraryItem } from "../../domain/catalog";
import type { MediaTrack, PlayerEngine, PlayMethod } from "../../domain/playback";
import type { TrackKind } from "../../domain/track-choice";
import { activeSegment, type MediaSegment } from "../../domain/media-segments";
import type { PlaybackSessionState } from "../../lib/player/session-state";
import { type ConversionIndicator } from "./conversion-copy";
import type { ReadyPlayerStatus } from "./player-status";
import { errorReason } from "./safe-reason";
import type { PlayOriginalState } from "./chrome/info-sheet";
import { PlayerSheets } from "./chrome/player-sheets";
import { AUDIO_PICK_NOT_APPLIED_COPY, conversionCopy } from "./chrome/osd-copy";
import { OSD_NOTICE_MS } from "./chrome/timing";
import { Osd } from "./chrome/osd";
import { useAutoSkip } from "./use-auto-skip";
import { CommandErrorPanel, PlayerWarnings } from "./chrome/player-error";
import { PlayerLoading, type LoadingBackdrop } from "./chrome/player-loading";
import { PlayerStatus } from "./chrome/player-status";
import { PlayerTopBar, titleLine } from "./chrome/player-top-bar";
import type { SeekChapter } from "./chrome/player-time";
import { SkipButton } from "./chrome/skip-button";
import { Scrubber } from "./chrome/scrubber";
import type { ConvertedTracks } from "./chrome/track-options";
import { TransportControls } from "./chrome/transport-controls";
import { focusChromeControl, useTvChromeFocus } from "./chrome/use-tv-chrome-focus";
import { useTvForm } from "../shared/use-tv-form";
import { CHROME_ZONE_ATTRIBUTE, useChromeVisibility } from "./chrome/use-chrome-visibility";
import { BUFFERING_STATUS_DELAY_MS } from "./chrome/timing";
import { useDelayedFlag } from "./chrome/use-delayed-flag";
import { useFullscreen } from "./chrome/use-fullscreen";
import { useOsd } from "./chrome/use-osd";
import { seekTarget, usePlayerKeys, type SheetName } from "./chrome/use-player-keys";
import "./chrome/player.css";
import { PlaybackErrorNotice } from "./playback-notices";
import { UNKNOWN_SERVER_NAME } from "./error-copy";
import { NativeVideoSurface } from "./native-video-surface";

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
  autoSkipSegments,
  serverName = UNKNOWN_SERVER_NAME,
  retrying,
  onRetry,
  onBack,
  onBackToDetails,
  seekPreview,
  chapters,
  convertedTracks,
  planTracks,
  onChangeConvertedTrack,
  retryLabel = "Retry",
  playMethod,
  indicator,
  audioPickNotApplied,
  playOriginal,
  backdrop,
  prompt,
  onPlayNext,
  onSignOut,
}: {
  item: LibraryItem;
  player: PlayerEngine;
  session: PlaybackSessionState;
  // What the app knows about the player, for the Info sheet.
  status: ReadyPlayerStatus;
  // Intro and outro segments to offer a skip button for. Empty or absent shows none.
  segments?: MediaSegment[];
  // Segments to seek past without a button (Skip automatically). Empty or absent skips none.
  autoSkipSegments?: MediaSegment[];
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
  // The plan's streams, for the track rows' codec, channels, and flags.
  planTracks?: readonly MediaTrack[];
  onChangeConvertedTrack?(kind: TrackKind, jellyfinIndex: number | undefined): Promise<void>;
  // The error panel's Retry text ("Back to previous tracks" after a failed track change).
  retryLabel?: string;
  // From the plan; absent until the server has answered.
  playMethod?: PlayMethod;
  indicator?: ConversionIndicator;
  // The audio track the viewer picked on the title's page was not the one the player started with.
  audioPickNotApplied?: boolean;
  playOriginal?: PlayOriginalState;
  // The art shown while loading.
  backdrop?: LoadingBackdrop;
  // The Up Next card. It sits inside the player so focus in it keeps the chrome up.
  prompt?: ReactNode;
  // Plays the next episode: `n`, and OK on the TV form. Set only while the Up Next card shows.
  onPlayNext?(): void;
  // Present only with a signed-in session and preferences: it shows the Settings button and sheet. Stops
  // playback and signs out; the sheet asks first.
  onSignOut?(): void;
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
  const chaptersId = useId();
  const settingsId = useId();

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
      setCommandError(errorReason(operationError, "Something went wrong."));
      return false;
    }
  }, []);

  useEffect(() => {
    if (retrying) setCommandError(undefined);
  }, [retrying]);

  const { fullscreen, fullscreenRef, changeFullscreen } = useFullscreen(player, execute);
  const converted = convertedTracks && onChangeConvertedTrack ? { tracks: convertedTracks, onChange: onChangeConvertedTrack } : undefined;

  const hasSettings = Boolean(onSignOut);
  const toggleSheet = useCallback((name: SheetName) => {
    if (name === "settings" && !hasSettings) return;
    setSheet((current) => (current === name ? undefined : name));
    setChipPresses(0);
  }, [hasSettings]);
  const closeSheet = useCallback(() => setSheet(undefined), []);
  const openInfoFromChip = () => {
    setChipPresses((count) => count + 1);
    setSheet("info");
  };

  const playing = Boolean(snapshot && !snapshot.paused);
  // TV scrub (DESIGN.md 7.14): a hold pauses a playing session so the picture is held, and the commit or
  // the cancel resumes it.
  const resumeAfterScrub = useRef(false);
  const onScrubHold = (held: boolean) => {
    if (held) {
      resumeAfterScrub.current = playing;
      if (playing) void execute(() => player.setPaused(true));
    } else if (resumeAfterScrub.current) {
      resumeAfterScrub.current = false;
      void execute(() => player.setPaused(false));
    }
  };
  const tv = useTvForm();
  const region = useRef<HTMLElement>(null);
  const visibility = useChromeVisibility({ playing, pinned: Boolean(commandError) || sheet !== undefined, tv });
  useTvChromeFocus(region);
  // TV idle: when the chrome hides while playing, focus moves to the player region, so the next arrow wakes it.
  useEffect(() => {
    if (!tv || visibility.visible) return;
    const active = document.activeElement;
    if (active && region.current?.contains(active) && active !== region.current) region.current.focus();
  }, [tv, visibility.visible]);
  const wakeChrome = visibility.wake;
  const wake = useCallback((target: "scrubber" | "play") => {
    wakeChrome();
    focusChromeControl(region.current, target);
  }, [wakeChrome]);
  const skip = segments && snapshot ? activeSegment(segments, snapshot.positionSeconds) : undefined;
  useAutoSkip({
    itemId: item.id,
    segments: autoSkipSegments,
    positionSeconds: snapshot?.positionSeconds,
    ready: session.firstFrameReady && !sessionError,
    seek: (seconds) => execute(() => player.seek(seconds)),
    showOsd: osd.show,
  });

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
    onWake: wake,
  });

  // The conversion is announced at the start of every converted session, and
  // again when its text changes (the server confirming it only repackages).
  const noticeText = indicator ? conversionCopy(indicator.chip, indicator.subtitlesBurnedIn) : undefined;
  const showOsd = osd.show;
  useEffect(() => {
    if (session.firstFrameReady && noticeText) showOsd(noticeText, "notice");
  }, [session.firstFrameReady, noticeText, showOsd]);

  // One line at the start of a session whose audio pick was not applied. A conversion line due at the same
  // first frame shows first and is never cut short.
  const noticeShown = useRef(noticeText);
  noticeShown.current = noticeText;
  useEffect(() => {
    if (!session.firstFrameReady || !audioPickNotApplied) return;
    const timer = window.setTimeout(() => showOsd(AUDIO_PICK_NOT_APPLIED_COPY, "audio"), noticeShown.current ? OSD_NOTICE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [session.firstFrameReady, audioPickNotApplied, showOsd]);

  const chromeShown = session.firstFrameReady || Boolean(commandError);
  const buffering = useDelayedFlag(chromeShown && Boolean(snapshot?.buffering), BUFFERING_STATUS_DELAY_MS);
  const backToDetails = () => void (onBackToDetails ?? onBack)();

  if (sessionError) {
    return (
      <section className="player-page" aria-label="Player" ref={region} tabIndex={tv ? -1 : undefined} data-tv-own-arrows={tv ? "" : undefined} {...visibility.sectionProps}>
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
    <section className="player-page" aria-label="Player" ref={region} tabIndex={tv ? -1 : undefined} data-tv-own-arrows={tv ? "" : undefined} {...visibility.sectionProps}>
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
              onScrubHold={onScrubHold}
              seekPreview={seekPreview}
              chapters={chapters}
            />
            <TransportControls
              snapshot={snapshot}
              fullscreen={fullscreen}
              chapters={Boolean(chapters?.length)}
              chaptersOpen={sheet === "chapters"}
              chaptersId={chaptersId}
              tracksOpen={sheet === "tracks"}
              infoOpen={sheet === "info"}
              tracksId={tracksId}
              infoId={infoId}
              settingsOpen={sheet === "settings"}
              settingsId={settingsId}
              onTogglePause={() => snapshot && void execute(() => player.setPaused(!snapshot.paused))}
              onSeekBy={(seconds) => snapshot && void execute(() => player.seek(seekTarget(snapshot, seconds)))}
              onToggleMute={() => snapshot && void execute(() => player.setMuted(!snapshot.muted))}
              onVolume={(volume) => void execute(() => player.setVolume(volume))}
              onToggleChapters={() => toggleSheet("chapters")}
              onToggleTracks={() => toggleSheet("tracks")}
              onToggleInfo={() => toggleSheet("info")}
              onToggleSettings={onSignOut ? () => toggleSheet("settings") : undefined}
              onToggleFullscreen={() => void changeFullscreen(!fullscreen)}
            />
          </footer>
        </div>
      )}

      {chromeShown && <PlayerStatus text={buffering ? "Buffering…" : undefined} />}
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

      <PlayerSheets
        sheet={sheet}
        ids={{ tracks: tracksId, info: infoId, chapters: chaptersId, settings: settingsId }}
        player={player}
        snapshot={snapshot}
        chapters={chapters}
        seekPreview={seekPreview}
        execute={execute}
        converted={converted}
        planTracks={planTracks}
        status={status}
        playMethod={playMethod}
        indicator={indicator}
        playOriginal={playOriginal}
        infoKey={chipPresses}
        focusPlayOriginal={chipPresses > 0}
        settings={onSignOut ? { onSignOut } : undefined}
        onClose={closeSheet}
      />
    </section>
  );
}
