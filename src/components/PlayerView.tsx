import { redactText } from "../lib/redact";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Gauge,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LibraryItem } from "../domain/catalog";
import type { PlayerEngine, PlayerTrack } from "../domain/playback";
import type { TrackKind } from "../domain/track-choice";
import { TrackMenus, type ConvertedTracks } from "../features/player/track-menus";
import { playerKeyAction } from "./player-keymap";
import type { PlaybackSessionState } from "../lib/player/session-state";
import type { MediaSegment } from "../domain/media-segments";
import { NativeVideoSurface } from "./NativeVideoSurface";
import { SkipSegmentButton } from "./SkipSegmentButton";

function time(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--:--";
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

// A named point on the seek bar.
export interface SeekChapter {
  startSeconds: number;
  name: string;
}

// The subtitle after the selected one, then off. Null when there are none.
function nextSubtitle(tracks: PlayerTrack[]): number | undefined | null {
  const subtitles = tracks.filter((track) => track.type === "Subtitle");
  if (subtitles.length === 0) return null;
  const selected = subtitles.findIndex((track) => track.selected);
  return subtitles[selected + 1]?.playerId;
}

function chapterAt(chapters: SeekChapter[], seconds: number): SeekChapter | undefined {
  let current: SeekChapter | undefined;
  for (const chapter of chapters) {
    if (chapter.startSeconds <= seconds) current = chapter;
  }
  return current;
}

export function PlayerView({
  item,
  player,
  session,
  segments,
  retrying,
  onRetry,
  onBack,
  seekPreview,
  chapters,
  convertedTracks,
  onChangeConvertedTrack,
}: {
  item: LibraryItem;
  player: PlayerEngine;
  session: PlaybackSessionState;
  // Intro and outro segments to offer a skip button for. Empty or absent shows none.
  segments?: MediaSegment[];
  retrying?: boolean;
  onRetry(): Promise<void> | void;
  onBack(): Promise<void> | void;
  // Both are optional and off by default: without them the seek bar is a bare
  // slider. seekPreview draws the picture shown above the time under the
  // pointer (or the keyboard position); chapters adds markers and names.
  seekPreview?: (seconds: number) => ReactNode;
  chapters?: SeekChapter[];
  // Set for a converted session: the track menus list the source's streams
  // and a choice goes to onChangeConvertedTrack (undefined: subtitles off),
  // which may start a new conversion. Absent, they list mpv's tracks.
  convertedTracks?: ConvertedTracks;
  onChangeConvertedTrack?(kind: TrackKind, jellyfinIndex: number | undefined): Promise<void>;
}) {
  const [commandError, setCommandError] = useState<string>();
  const [fullscreen, setFullscreenState] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekValue, setSeekValue] = useState<number>();
  const [volumeValue, setVolumeValue] = useState<number>();
  const [hoverSeconds, setHoverSeconds] = useState<number>();
  const [seekFocused, setSeekFocused] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const snapshot = session.snapshot;
  const error = commandError ?? session.error;
  const reportingWarning = session.reportingWarning;
  const snapshotRef = useRef(snapshot);
  const fullscreenRef = useRef(fullscreen);
  const onBackRef = useRef(onBack);

  useEffect(() => {
    snapshotRef.current = snapshot;
    fullscreenRef.current = fullscreen;
    onBackRef.current = onBack;
  }, [fullscreen, onBack, snapshot]);

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

  const changeFullscreen = useCallback(async (next: boolean) => {
    const previous = fullscreenRef.current;
    fullscreenRef.current = next;
    setFullscreenState(next);
    const changed = await execute(() => player.setFullscreen(next));
    if (!changed) {
      fullscreenRef.current = previous;
      setFullscreenState(previous);
    }
  }, [execute, player]);

  useEffect(() => {
    const updateFullscreen = (value: boolean) => {
      fullscreenRef.current = value;
      setFullscreenState(value);
    };
    if (player.mode === "browser") {
      const onFullscreenChange = () => updateFullscreen(Boolean(document.fullscreenElement));
      document.addEventListener("fullscreenchange", onFullscreenChange);
      return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
    }

    let cancelled = false;
    let removeListener: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      const syncFullscreen = async () => {
        const value = await appWindow.isFullscreen();
        if (!cancelled) updateFullscreen(value);
      };
      await syncFullscreen();
      const unlisten = await appWindow.onResized(() => void syncFullscreen());
      if (cancelled) unlisten();
      else removeListener = unlisten;
    });
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [player.mode]);

  const showControls = () => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    if (!snapshot?.paused && !error) {
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2600);
    }
  };

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      const action = playerKeyAction(keyboardEvent);
      if (!action) return;
      keyboardEvent.preventDefault();
      const current = snapshotRef.current;
      switch (action.kind) {
        case "toggle-pause":
          if (current) void execute(() => player.setPaused(!current.paused));
          break;
        case "seek-by": {
          if (!current) break;
          const end = current.durationSeconds ?? Number.POSITIVE_INFINITY;
          const target = Math.min(Math.max(0, current.positionSeconds + action.seconds), end);
          void execute(() => player.seek(target));
          break;
        }
        case "volume-by": {
          if (!current) break;
          const volume = Math.min(100, Math.max(0, current.volume + action.amount));
          void execute(() => player.setVolume(volume));
          break;
        }
        case "toggle-mute":
          if (current) void execute(() => player.setMuted(!current.muted));
          break;
        case "toggle-fullscreen":
          void changeFullscreen(!fullscreenRef.current);
          break;
        case "cycle-subtitles": {
          const next = current ? nextSubtitle(current.tracks) : null;
          if (next !== null) void execute(() => player.selectTrack("subtitle", next));
          break;
        }
        case "escape":
          // Escape leaves fullscreen first, then the player.
          if (fullscreenRef.current) void changeFullscreen(false);
          else void onBackRef.current();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeFullscreen, execute, player]);

  const commitVolume = () => {
    if (volumeValue == null) return;
    const nextVolume = volumeValue;
    setVolumeValue(undefined);
    void execute(() => player.setVolume(nextVolume));
  };

  const duration = snapshot?.durationSeconds ?? 0;
  const position = seekValue ?? snapshot?.positionSeconds ?? 0;
  const diagnostics = snapshot?.diagnostics;
  const seekEnhanced = Boolean(seekPreview) || Boolean(chapters?.length);
  const previewSeconds = hoverSeconds ?? (seekFocused ? position : undefined);
  const chapterName = previewSeconds != null && chapters ? chapterAt(chapters, previewSeconds)?.name : undefined;

  const seekControl = (
    <input
      aria-label="Playback position"
      type="range"
      min={0}
      max={Math.max(duration, 1)}
      step={0.25}
      value={Math.min(position, Math.max(duration, 1))}
      onChange={(changeEvent) => setSeekValue(Number(changeEvent.target.value))}
      onPointerUp={() => {
        if (seekValue != null) void execute(() => player.seek(seekValue));
        setSeekValue(undefined);
      }}
      onKeyUp={() => {
        if (seekValue != null) void execute(() => player.seek(seekValue));
        setSeekValue(undefined);
      }}
      onFocus={() => setSeekFocused(true)}
      onBlur={() => setSeekFocused(false)}
      disabled={!snapshot || !duration}
    />
  );

  const moveSeekPreview = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    const box = pointerEvent.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = (pointerEvent.clientX - box.left) / box.width;
    if (!Number.isFinite(fraction)) return;
    setHoverSeconds(Math.min(Math.max(fraction, 0), 1) * duration);
  };

  return (
    <section className="player-page" onMouseMove={showControls} onMouseLeave={() => !snapshot?.paused && setControlsVisible(false)}>
      <NativeVideoSurface player={player} onError={setCommandError} />
      {!session.firstFrameReady && <div className="video-loading-cover" />}
      <div className="player-shade" />

      <header className={`player-header ${controlsVisible ? "is-visible" : ""}`}>
        <button className="player-circle-button" aria-label="Back to library" onClick={() => void onBack()}>
          <ArrowLeft size={21} />
        </button>
        <div>
          <p>{item.type === "Episode" ? item.seriesName ?? "EPISODE" : "NOW PLAYING"}</p>
          <h1>{item.name}</h1>
        </div>
        {diagnostics && (
          <div className="player-diagnostics">
            <Gauge size={15} />
            <span>{diagnostics.decodeLabel}</span>
            <small>{diagnostics.videoCodec ?? "loading"}{diagnostics.width ? ` · ${diagnostics.width}×${diagnostics.height}` : ""}</small>
          </div>
        )}
      </header>

      {!snapshot && !error && (
        <div className="player-center-state"><LoaderCircle className="spin" /><span>Preparing original file…</span></div>
      )}
      {snapshot?.buffering && (
        <div className="player-center-state"><LoaderCircle className="spin" /><span>Buffering…</span></div>
      )}
      {error && (
        <div className="player-error-panel">
          <AlertTriangle size={26} />
          <h2>Playback could not start</h2>
          <p>{error}</p>
          <div className="player-error-actions">
            <button onClick={() => void onRetry()} disabled={retrying}>
              {retrying ? <LoaderCircle className="spin" size={17} /> : null}
              Retry
            </button>
            <button onClick={() => void onBack()}>Back to library</button>
          </div>
        </div>
      )}

      {diagnostics?.decodeMode === "software" && !error && (
        <div className="player-cpu-warning"><AlertTriangle size={15} /> Software decoding on this CPU.</div>
      )}
      {reportingWarning && !error && (
        <div className="player-reporting-warning"><AlertTriangle size={15} /> Jellyfin progress reporting failed: {reportingWarning}</div>
      )}

      {segments && snapshot && (
        <SkipSegmentButton
          segments={segments}
          positionSeconds={snapshot.positionSeconds}
          onSeek={(seconds) => void execute(() => player.seek(seconds))}
        />
      )}

      <footer className={`player-controls ${controlsVisible || snapshot?.paused ? "is-visible" : ""}`}>
        <div className="seek-row">
          <span>{time(position)}</span>
          {seekEnhanced ? (
            <div
              className="seek-track"
              onPointerMove={moveSeekPreview}
              onPointerLeave={() => setHoverSeconds(undefined)}
            >
              {seekControl}
              {duration > 0 && chapters?.map((chapter) => {
                if (chapter.startSeconds <= 0 || chapter.startSeconds >= duration) return null;
                return (
                  <span
                    key={`${chapter.startSeconds}-${chapter.name}`}
                    className="seek-chapter"
                    role="img"
                    aria-label={`Chapter: ${chapter.name} at ${time(chapter.startSeconds)}`}
                    style={{ left: `${(chapter.startSeconds / duration) * 100}%` }}
                  />
                );
              })}
              {previewSeconds != null && duration > 0 && (
                <div className="seek-preview" style={{ "--seek-x": `${(previewSeconds / duration) * 100}%` } as CSSProperties}>
                  {seekPreview?.(previewSeconds)}
                  <strong>{time(previewSeconds)}</strong>
                  {chapterName && <em>{chapterName}</em>}
                </div>
              )}
            </div>
          ) : seekControl}
          <span>{time(snapshot?.durationSeconds)}</span>
        </div>
        <div className="control-row">
          <button
            className="primary-play-control"
            aria-label={snapshot?.paused ? "Play" : "Pause"}
            onClick={() => snapshot && void execute(() => player.setPaused(!snapshot.paused))}
            disabled={!snapshot}
          >
            {snapshot?.paused ? <Play size={23} fill="currentColor" /> : <Pause size={23} fill="currentColor" />}
          </button>
          <button
            className="player-control-button"
            aria-label={snapshot?.muted ? "Unmute" : "Mute"}
            onClick={() => snapshot && void execute(() => player.setMuted(!snapshot.muted))}
            disabled={!snapshot}
          >
            {snapshot?.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <input
            className="volume-slider"
            aria-label="Volume"
            type="range"
            min={0}
            max={100}
            value={volumeValue ?? snapshot?.volume ?? 100}
            onChange={(changeEvent) => setVolumeValue(Number(changeEvent.target.value))}
            onPointerUp={commitVolume}
            onKeyUp={commitVolume}
            onBlur={commitVolume}
            disabled={!snapshot}
          />
          <TrackMenus
            snapshot={snapshot}
            converted={convertedTracks && onChangeConvertedTrack ? { tracks: convertedTracks, onChange: onChangeConvertedTrack } : undefined}
            onSelect={(kind, id) => void execute(() => player.selectTrack(kind, id))}
            onChangeConverted={(change) => void execute(change)}
          />
          <span className="control-spacer" />
          <button
            className="player-control-button"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => void changeFullscreen(!fullscreen)}
          >
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </footer>
    </section>
  );
}
