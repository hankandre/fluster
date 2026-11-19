import type { ReactNode } from "react";
import type { TrackKind } from "../../../domain/track-choice";
import type { MediaTrack, PlaybackSnapshot, PlayerEngine, PlayMethod } from "../../../domain/playback";
import type { ConversionIndicator } from "../conversion-copy";
import type { ReadyPlayerStatus } from "../player-status";
import { ChapterList } from "./chapter-list";
import { InfoSheet, type PlayOriginalState } from "./info-sheet";
import type { SeekChapter } from "./player-time";
import { SettingsSheet } from "./settings-sheet";
import { TrackPanel } from "./track-panel";
import type { ConvertedTracks } from "./track-options";
import type { SheetName } from "./use-player-keys";

// The one open side sheet, if any: Chapters, Audio & Subtitles, Info, or Settings.
export function PlayerSheets({
  sheet,
  ids,
  player,
  snapshot,
  chapters,
  seekPreview,
  execute,
  converted,
  planTracks,
  status,
  playMethod,
  indicator,
  playOriginal,
  infoKey,
  focusPlayOriginal,
  settings,
  onClose,
}: {
  sheet: SheetName | undefined;
  ids: Record<SheetName, string>;
  player: PlayerEngine;
  snapshot: PlaybackSnapshot | undefined;
  chapters?: SeekChapter[];
  seekPreview?: (seconds: number, frameWidth?: number) => ReactNode;
  execute(operation: () => Promise<void>): Promise<boolean>;
  converted: { tracks: ConvertedTracks; onChange(kind: TrackKind, jellyfinIndex: number | undefined): Promise<void> } | undefined;
  planTracks?: readonly MediaTrack[];
  status: ReadyPlayerStatus;
  playMethod?: PlayMethod;
  indicator?: ConversionIndicator;
  playOriginal?: PlayOriginalState;
  // Remounts the Info sheet on a new chip press so focus can move to Play original.
  infoKey: number;
  focusPlayOriginal: boolean;
  settings?: { confirm(message: string): void; onSignOut(): void };
  onClose(): void;
}) {
  switch (sheet) {
    case "chapters":
      if (!chapters || chapters.length === 0) return null;
      return (
        <ChapterList
          id={ids.chapters}
          chapters={chapters}
          positionSeconds={snapshot?.positionSeconds}
          durationSeconds={snapshot?.durationSeconds}
          picture={seekPreview}
          onSeek={(seconds) => void execute(() => player.seek(seconds))}
          onClose={onClose}
        />
      );
    case "tracks":
      return (
        <TrackPanel
          id={ids.tracks}
          snapshot={snapshot}
          converted={converted}
          planTracks={planTracks}
          onSelect={(kind, id) => void execute(() => player.selectTrack(kind, id))}
          onChangeConverted={(change) => void execute(change)}
          onClose={onClose}
        />
      );
    case "info":
      return (
        <InfoSheet
          key={infoKey}
          id={ids.info}
          status={status}
          snapshot={snapshot}
          playMethod={playMethod}
          indicator={indicator}
          playOriginal={playOriginal}
          focusPlayOriginal={focusPlayOriginal}
          onClose={onClose}
        />
      );
    case "settings":
      if (!settings) return null;
      return <SettingsSheet id={ids.settings} onClose={onClose} confirm={settings.confirm} onSignOut={settings.onSignOut} />;
    default:
      return null;
  }
}
