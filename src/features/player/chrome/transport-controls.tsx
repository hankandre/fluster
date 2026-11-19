import { useState } from "react";
import { Captions, Info, ListVideo, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, Volume2, VolumeX } from "lucide-react";
import type { PlaybackSnapshot } from "../../../domain/playback";
import { SEEK_STEP_SECONDS } from "../player-keymap";
import { Button } from "../../shared/ui";
import { useTvForm } from "../../shared/use-tv-form";

// Play or Pause, back and forward 10 s, mute and volume on the left; Chapters
// (only when the item has them), Audio & Subtitles, Settings (when given), Info, and Fullscreen on the right.
export function TransportControls({
  snapshot,
  fullscreen,
  chapters = false,
  chaptersOpen = false,
  chaptersId,
  tracksOpen,
  infoOpen,
  tracksId,
  infoId,
  settingsOpen = false,
  settingsId,
  onTogglePause,
  onSeekBy,
  onToggleMute,
  onVolume,
  onToggleChapters,
  onToggleTracks,
  onToggleInfo,
  onToggleSettings,
  onToggleFullscreen,
}: {
  snapshot: PlaybackSnapshot | undefined;
  fullscreen: boolean;
  // True when the item has chapters: the Chapters button shows.
  chapters?: boolean;
  chaptersOpen?: boolean;
  chaptersId?: string;
  tracksOpen: boolean;
  infoOpen: boolean;
  tracksId: string;
  infoId: string;
  settingsOpen?: boolean;
  settingsId?: string;
  onTogglePause(): void;
  onSeekBy(seconds: number): void;
  onToggleMute(): void;
  onVolume(volume: number): void;
  onToggleChapters?(): void;
  onToggleTracks(): void;
  onToggleInfo(): void;
  // Shows the Settings button between Audio & Subtitles and Info when given.
  onToggleSettings?(): void;
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
  const chapterList = chapters ? (
    <Button
      variant="icon"
      aria-label="Chapters"
      aria-expanded={chaptersOpen}
      aria-controls={chaptersOpen ? chaptersId : undefined}
      onClick={onToggleChapters}
      disabled={!snapshot}
    >
      <ListVideo size={20} aria-hidden="true" />
    </Button>
  ) : null;
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
  const settings = onToggleSettings ? (
    <Button
      variant="icon"
      aria-label="Settings"
      aria-expanded={settingsOpen}
      aria-controls={settingsOpen ? settingsId : undefined}
      onClick={onToggleSettings}
    >
      <Settings size={20} aria-hidden="true" />
    </Button>
  ) : null;
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
        <div className="control-end">{chapterList}{tracks}{settings}{info}</div>
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
          aria-valuetext={`${Math.round(volumeValue ?? snapshot?.volume ?? 100)}%`}
          onChange={(event) => setVolumeValue(Number(event.target.value))}
          onPointerUp={commitVolume}
          onKeyUp={commitVolume}
          onBlur={commitVolume}
          disabled={!snapshot}
        />
      </div>
      <span className="control-spacer" />
      {chapterList}
      {tracks}
      {settings}
      {info}
      <Button variant="icon" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={onToggleFullscreen}>
        {fullscreen ? <Minimize size={20} aria-hidden="true" /> : <Maximize size={20} aria-hidden="true" />}
      </Button>
    </div>
  );
}
