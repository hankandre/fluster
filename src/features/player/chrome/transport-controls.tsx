import { useState } from "react";
import { Captions, Info, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import type { PlaybackSnapshot } from "../../../domain/playback";
import { SEEK_STEP_SECONDS } from "../../../components/player-keymap";
import { Button } from "../../shared/ui";
import { useTvForm } from "../../shared/use-tv-form";

// Play or Pause, back and forward 10 s, mute and volume on the left; Audio &
// Subtitles, Info, and Fullscreen on the right.
export function TransportControls({
  snapshot,
  fullscreen,
  tracksOpen,
  infoOpen,
  tracksId,
  infoId,
  onTogglePause,
  onSeekBy,
  onToggleMute,
  onVolume,
  onToggleTracks,
  onToggleInfo,
  onToggleFullscreen,
}: {
  snapshot: PlaybackSnapshot | undefined;
  fullscreen: boolean;
  tracksOpen: boolean;
  infoOpen: boolean;
  tracksId: string;
  infoId: string;
  onTogglePause(): void;
  onSeekBy(seconds: number): void;
  onToggleMute(): void;
  onVolume(volume: number): void;
  onToggleTracks(): void;
  onToggleInfo(): void;
  onToggleFullscreen(): void;
}) {
  const [volumeValue, setVolumeValue] = useState<number>();
  const tv = useTvForm();

  const commitVolume = () => {
    if (volumeValue == null) return;
    const next = volumeValue;
    setVolumeValue(undefined);
    onVolume(next);
  };

  const play = (
    <Button
      variant="icon"
      data-role="play"
      aria-label={snapshot?.paused ? "Play" : "Pause"}
      onClick={onTogglePause}
      disabled={!snapshot}
    >
      {snapshot?.paused ? <Play size={26} fill="currentColor" aria-hidden="true" /> : <Pause size={26} fill="currentColor" aria-hidden="true" />}
    </Button>
  );
  const back = (
    <Button variant="icon" aria-label="Back 10 seconds" onClick={() => onSeekBy(-SEEK_STEP_SECONDS)} disabled={!snapshot}>
      <RotateCcw size={20} aria-hidden="true" />
    </Button>
  );
  const forward = (
    <Button variant="icon" aria-label="Forward 10 seconds" onClick={() => onSeekBy(SEEK_STEP_SECONDS)} disabled={!snapshot}>
      <RotateCw size={20} aria-hidden="true" />
    </Button>
  );
  const tracks = (
    <Button
      variant="icon"
      aria-label="Audio & Subtitles"
      aria-expanded={tracksOpen}
      aria-controls={tracksOpen ? tracksId : undefined}
      onClick={onToggleTracks}
      disabled={!snapshot}
    >
      <Captions size={20} aria-hidden="true" />
    </Button>
  );
  const info = (
    <Button
      variant="icon"
      aria-label="Info"
      aria-expanded={infoOpen}
      aria-controls={infoOpen ? infoId : undefined}
      onClick={onToggleInfo}
    >
      <Info size={20} aria-hidden="true" />
    </Button>
  );

  // The TV form centres back 10, Play or Pause, and forward 10, with no volume and no Fullscreen: the TV owns
  // both (DESIGN.md 7.14).
  if (tv) {
    return (
      <div className="control-row" data-tv="true">
        <span />
        <div className="control-center">{back}{play}{forward}</div>
        <div className="control-end">{tracks}{info}</div>
      </div>
    );
  }

  return (
    <div className="control-row">
      {play}
      {back}
      {forward}
      <div className="volume-group">
        <Button variant="icon" aria-label={snapshot?.muted ? "Unmute" : "Mute"} onClick={onToggleMute} disabled={!snapshot}>
          {snapshot?.muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
        </Button>
        <input
          className="volume-slider"
          aria-label="Volume"
          type="range"
          min={0}
          max={100}
          value={volumeValue ?? snapshot?.volume ?? 100}
          onChange={(event) => setVolumeValue(Number(event.target.value))}
          onPointerUp={commitVolume}
          onKeyUp={commitVolume}
          onBlur={commitVolume}
          disabled={!snapshot}
        />
      </div>
      <span className="control-spacer" />
      {tracks}
      {info}
      <Button variant="icon" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={onToggleFullscreen}>
        {fullscreen ? <Minimize size={20} aria-hidden="true" /> : <Maximize size={20} aria-hidden="true" />}
      </Button>
    </div>
  );
}
