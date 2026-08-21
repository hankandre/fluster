import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  AudioLines,
  Captions,
  Gauge,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LibraryItem, PlayerEngine, PlayerEvent } from "../domain/playback";
import { NativeVideoSurface } from "./NativeVideoSurface";

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

export function PlayerView({ item, player, event, firstFrameReady, launchError, onBack }: {
  item: LibraryItem;
  player: PlayerEngine;
  event?: PlayerEvent;
  firstFrameReady: boolean;
  launchError?: string;
  onBack(): Promise<void> | void;
}) {
  const [commandError, setCommandError] = useState<string>();
  const [fullscreen, setFullscreenState] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekValue, setSeekValue] = useState<number>();
  const hideTimer = useRef<number | undefined>(undefined);
  const snapshot = event && "snapshot" in event ? event.snapshot : undefined;
  const error = launchError ?? commandError ?? (event?.kind === "error" ? event.message : undefined);

  useEffect(() => {
    document.documentElement.classList.add("native-playing");
    document.body.classList.add("native-playing");
    return () => {
      document.documentElement.classList.remove("native-playing");
      document.body.classList.remove("native-playing");
    };
  }, []);

  const execute = async (operation: () => Promise<void>) => {
    try {
      setCommandError(undefined);
      await operation();
    } catch (operationError) {
      setCommandError(operationError instanceof Error ? operationError.message : String(operationError));
    }
  };

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
      const target = keyboardEvent.target as HTMLElement | null;
      if (target?.matches("input, select, button")) return;
      if (keyboardEvent.key === " " && snapshot) {
        keyboardEvent.preventDefault();
        void execute(() => player.setPaused(!snapshot.paused));
      } else if (keyboardEvent.key === "ArrowLeft" && snapshot) {
        void execute(() => player.seek(Math.max(0, snapshot.positionSeconds - 10)));
      } else if (keyboardEvent.key === "ArrowRight" && snapshot) {
        void execute(() => player.seek(snapshot.positionSeconds + 10));
      } else if (keyboardEvent.key.toLowerCase() === "m" && snapshot) {
        void execute(() => player.setMuted(!snapshot.muted));
      } else if (keyboardEvent.key.toLowerCase() === "f") {
        const next = !fullscreen;
        setFullscreenState(next);
        void execute(() => player.setFullscreen(next));
      } else if (keyboardEvent.key === "Escape" && !fullscreen) {
        void onBack();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, onBack, player, snapshot]);

  const audioTracks = useMemo(
    () => snapshot?.tracks.filter((track) => track.type === "Audio") ?? [],
    [snapshot?.tracks],
  );
  const subtitleTracks = useMemo(
    () => snapshot?.tracks.filter((track) => track.type === "Subtitle") ?? [],
    [snapshot?.tracks],
  );
  const duration = snapshot?.durationSeconds ?? 0;
  const position = seekValue ?? snapshot?.positionSeconds ?? 0;
  const diagnostics = snapshot?.diagnostics;

  return (
    <section className="player-page" onMouseMove={showControls} onMouseLeave={() => !snapshot?.paused && setControlsVisible(false)}>
      <NativeVideoSurface player={player} onError={setCommandError} />
      {!firstFrameReady && <div className="video-loading-cover" />}
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
          <button onClick={() => void onBack()}>Back to library</button>
        </div>
      )}

      {diagnostics?.decodeMode === "software" && !error && (
        <div className="player-cpu-warning"><AlertTriangle size={15} /> Software decoding on this CPU. Jellyfin transcoding remains disabled.</div>
      )}

      <footer className={`player-controls ${controlsVisible || snapshot?.paused ? "is-visible" : ""}`}>
        <div className="seek-row">
          <span>{time(position)}</span>
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
            disabled={!snapshot || !duration}
          />
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
            value={snapshot?.volume ?? 100}
            onChange={(changeEvent) => void execute(() => player.setVolume(Number(changeEvent.target.value)))}
            disabled={!snapshot}
          />
          <label className="track-control">
            <AudioLines size={18} />
            <select
              aria-label="Audio track"
              value={audioTracks.find((track) => track.selected)?.playerId ?? ""}
              onChange={(changeEvent) => void execute(() => player.selectTrack("audio", Number(changeEvent.target.value)))}
              disabled={!audioTracks.length}
            >
              {audioTracks.map((track) => <option key={track.playerId} value={track.playerId}>{track.title}</option>)}
            </select>
          </label>
          <label className="track-control">
            <Captions size={18} />
            <select
              aria-label="Subtitle track"
              value={subtitleTracks.find((track) => track.selected)?.playerId ?? "off"}
              onChange={(changeEvent) => void execute(() => player.selectTrack("subtitle", changeEvent.target.value === "off" ? undefined : Number(changeEvent.target.value)))}
            >
              <option value="off">Subtitles off</option>
              {subtitleTracks.map((track) => <option key={track.playerId} value={track.playerId}>{track.title}</option>)}
            </select>
          </label>
          <span className="control-spacer" />
          <button
            className="player-control-button"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => {
              const next = !fullscreen;
              setFullscreenState(next);
              void execute(() => player.setFullscreen(next));
            }}
          >
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </footer>
    </section>
  );
}
