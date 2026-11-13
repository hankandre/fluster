import { useEffect, useRef, type MutableRefObject } from "react";
import { playerKeyAction } from "../../../components/player-keymap";
import type { PlaybackSnapshot, PlayerEngine } from "../../../domain/playback";
import { nextSourceSubtitle, type TrackKind } from "../../../domain/track-choice";
import { END_COPY, fractionCopy, MUTED_COPY, seekCopy, START_COPY, subtitleCopy, volumeCopy } from "./osd-copy";
import { isTvForm } from "../../shared/tv-form";
import { nextSubtitle, type ConvertedTracks } from "./track-options";
import type { OsdKind } from "./use-osd";

export type SheetName = "tracks" | "info";

// Where a relative seek lands: within the file, never before its start.
export function seekTarget(snapshot: PlaybackSnapshot, seconds: number): number {
  const end = snapshot.durationSeconds ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(0, snapshot.positionSeconds + seconds), end);
}

interface Converted {
  tracks: ConvertedTracks;
  onChange(kind: TrackKind, jellyfinIndex: number | undefined): Promise<void>;
}

interface PlayerKeysInput {
  // While true (an error notice is up) only Escape is handled, so Space, Enter, and the arrows reach the notice's buttons.
  suspended: boolean;
  player: PlayerEngine;
  snapshot: PlaybackSnapshot | undefined;
  converted: Converted | undefined;
  sheet: SheetName | undefined;
  execute(operation: () => Promise<void>): Promise<boolean>;
  changeFullscreen(next: boolean): Promise<void>;
  fullscreenRef: MutableRefObject<boolean>;
  onBack(): Promise<void> | void;
  onToggleSheet(sheet: SheetName): void;
  onCloseSheet(): void;
  showOsd(text: string, kind?: OsdKind): void;
  // Where Skip seeks to, when a skip is on offer.
  skipTo: number | undefined;
  chromeVisible: boolean;
  // Plays the next episode while the Up Next card is shown.
  onPlayNext?(): void;
  // TV form: shows the chrome and focuses the scrubber (arrows) or Play or Pause (OK with no prompt).
  onWake?(target: "scrubber" | "play"): void;
}

// The player's keyboard shortcuts. A key does its action and posts a message
// to the on-screen pill, whether or not the chrome is visible.
export function usePlayerKeys(input: PlayerKeysInput): void {
  const latest = useRef(input);

  useEffect(() => {
    latest.current = input;
  });

  useEffect(() => {
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      const action = playerKeyAction({ key: keyboardEvent.key, repeat: keyboardEvent.repeat, ctrlKey: keyboardEvent.ctrlKey, metaKey: keyboardEvent.metaKey, altKey: keyboardEvent.altKey, target: keyboardEvent.target, tv: isTvForm() });
      if (!action) return;
      if (latest.current.suspended && action.kind !== "escape") return;
      keyboardEvent.preventDefault();
      const { player, snapshot, converted, sheet, execute, changeFullscreen, fullscreenRef, onBack, onToggleSheet, onCloseSheet, showOsd, skipTo, chromeVisible, onPlayNext, onWake } = latest.current;
      switch (action.kind) {
        case "toggle-pause":
          if (snapshot) void execute(() => player.setPaused(!snapshot.paused));
          break;
        case "seek-by": {
          if (!snapshot) break;
          const target = seekTarget(snapshot, action.seconds);
          void execute(() => player.seek(target));
          showOsd(seekCopy(action.seconds));
          break;
        }
        case "seek-to": {
          if (!snapshot) break;
          const duration = snapshot.durationSeconds;
          if (action.fraction > 0 && !duration) break;
          const target = action.fraction === 0 ? 0 : action.fraction * (duration ?? 0);
          void execute(() => player.seek(target));
          showOsd(action.fraction === 0 ? START_COPY : action.fraction === 1 ? END_COPY : fractionCopy(action.fraction));
          break;
        }
        case "volume-by": {
          if (!snapshot) break;
          const volume = Math.min(100, Math.max(0, snapshot.volume + action.amount));
          void execute(() => player.setVolume(volume));
          showOsd(volumeCopy(volume));
          break;
        }
        case "toggle-mute":
          if (snapshot) {
            void execute(() => player.setMuted(!snapshot.muted));
            showOsd(snapshot.muted ? volumeCopy(snapshot.volume) : MUTED_COPY);
          }
          break;
        case "toggle-fullscreen":
          void changeFullscreen(!fullscreenRef.current);
          break;
        case "cycle-subtitles": {
          if (!snapshot) break;
          // A converted session cycles the source's subtitles through the
          // same rules as its panel (burned-in subtitles need a new conversion).
          if (converted) {
            const next = nextSourceSubtitle(converted.tracks.subtitle);
            if (next === null) {
              showOsd(subtitleCopy(null));
              break;
            }
            void execute(() => converted.onChange("subtitle", next));
            showOsd(subtitleCopy(converted.tracks.subtitle.find((track) => track.jellyfinIndex === next)?.title));
            break;
          }
          const next = nextSubtitle(snapshot.tracks);
          if (next === null) {
            showOsd(subtitleCopy(null));
            break;
          }
          void execute(() => player.selectTrack("subtitle", next));
          showOsd(subtitleCopy(snapshot.tracks.find((track) => track.type === "Subtitle" && track.playerId === next)?.title));
          break;
        }
        case "open-tracks":
          onToggleSheet("tracks");
          break;
        case "toggle-info":
          onToggleSheet("info");
          break;
        case "skip":
          if (skipTo !== undefined) void execute(() => player.seek(skipTo));
          break;
        case "play-next":
          onPlayNext?.();
          break;
        case "ok":
          // OK is a remote's only key: it acts on the visible prompt while
          // the chrome is hidden, and only in the TV form (DESIGN.md 7.15).
          if (!isTvForm() || chromeVisible) break;
          if (skipTo !== undefined) void execute(() => player.seek(skipTo));
          else if (onPlayNext) onPlayNext();
          else onWake?.("play");
          break;
        case "wake":
          onWake?.("scrubber");
          break;
        case "escape":
          // Escape closes an open sheet, then leaves fullscreen, then the player.
          if (sheet) onCloseSheet();
          else if (fullscreenRef.current) void changeFullscreen(false);
          else void onBack();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
