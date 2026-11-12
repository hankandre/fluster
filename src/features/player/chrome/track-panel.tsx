import { useEffect, useRef } from "react";
import type { PlaybackSnapshot } from "../../../domain/playback";
import type { TrackKind } from "../../../domain/track-choice";
import { OptionList } from "../../shared/ui";
import { PlayerSheet } from "./player-sheet";
import { audioRows, subtitleRows, trackIdOf, type ConvertedTracks } from "./track-options";

export interface TrackPanelConverted {
  tracks: ConvertedTracks;
  onChange(kind: TrackKind, jellyfinIndex: number | undefined): Promise<void>;
}

// The Audio and Subtitles side sheet. Direct play lists mpv's tracks and
// switches by mpv id. A converted session lists the source's streams and hands
// the Jellyfin index (undefined: subtitles off) to `converted.onChange`, which
// may renegotiate. The panel stays open after a choice.
export function TrackPanel({ id, snapshot, converted, onSelect, onChangeConverted, onClose }: {
  id?: string;
  snapshot: PlaybackSnapshot | undefined;
  converted?: TrackPanelConverted;
  onSelect(kind: TrackKind, playerId: number | undefined): void;
  onChangeConverted(change: () => Promise<void>): void;
  onClose(): void;
}) {
  const audio = useRef<HTMLElement>(null);
  const subtitle = useRef<HTMLElement>(null);
  // The list a converted-session choice came from. A renegotiation disables the
  // lists, which drops keyboard focus; it returns to the selected row once the
  // new session offers them again.
  const refocus = useRef<TrackKind | undefined>(undefined);

  useEffect(() => {
    const kind = refocus.current;
    if (!kind || !converted || !snapshot) return;
    const list = (kind === "audio" ? audio : subtitle).current;
    const row = list?.querySelector<HTMLElement>('[role="option"][tabindex="0"]');
    if (!row) return;
    refocus.current = undefined;
    // Only when focus was lost; never take it from another control.
    const focused = document.activeElement;
    if (!focused || focused === document.body) row.focus();
  });

  const audioList = audioRows(snapshot, converted?.tracks);
  const subtitleList = subtitleRows(snapshot, converted?.tracks);

  const choose = (kind: TrackKind, value: string) => {
    const trackId = trackIdOf(value);
    if (converted) {
      refocus.current = kind;
      onChangeConverted(() => converted.onChange(kind, trackId));
    } else {
      onSelect(kind, trackId);
    }
  };

  return (
    <PlayerSheet id={id} label="Audio and subtitles" title="Audio & Subtitles" onClose={onClose}>
      <section className="player-sheet-section" ref={audio}>
        <h3>Audio</h3>
        <OptionList
          label="Audio track"
          options={audioList.options}
          value={audioList.value}
          onChange={(value) => choose("audio", value)}
          disabled={!snapshot || audioList.options.length === 0}
        />
      </section>
      <section className="player-sheet-section" ref={subtitle}>
        <h3>Subtitles</h3>
        <OptionList
          label="Subtitle track"
          options={subtitleList.options}
          value={subtitleList.value}
          onChange={(value) => choose("subtitle", value)}
          disabled={!snapshot}
        />
      </section>
    </PlayerSheet>
  );
}
