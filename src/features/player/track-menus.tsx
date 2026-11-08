import { useEffect, useRef } from "react";
import { AudioLines, Captions } from "lucide-react";
import type { PlaybackSnapshot } from "../../domain/playback";
import type { SourceTrackOption, TrackKind } from "../../domain/track-choice";

// A converted session's track lists: every source stream, by Jellyfin index.
export interface ConvertedTracks {
  audio: SourceTrackOption[];
  subtitle: SourceTrackOption[];
}

const OFF = "off";

// The player's Audio and Subtitle menus. Direct play lists mpv's tracks and
// switches by mpv id. A converted session lists the source's streams, since
// the conversion carries only some of them, and hands the Jellyfin index
// (undefined: subtitles off) to `converted.onChange`, which may renegotiate.
// P13-13 replaces these selects with the TrackPanel.
export function TrackMenus({ snapshot, converted, onSelect, onChangeConverted }: {
  snapshot: PlaybackSnapshot | undefined;
  converted?: {
    tracks: ConvertedTracks;
    onChange(kind: TrackKind, jellyfinIndex: number | undefined): Promise<void>;
  };
  onSelect(kind: TrackKind, playerId: number | undefined): void;
  onChangeConverted(change: () => Promise<void>): void;
}) {
  const audioSelect = useRef<HTMLSelectElement>(null);
  const subtitleSelect = useRef<HTMLSelectElement>(null);
  // The menu a converted-session choice came from. A renegotiation disables
  // the menus, which drops keyboard focus; it returns once the new session
  // offers them again.
  const refocus = useRef<TrackKind | undefined>(undefined);

  useEffect(() => {
    const kind = refocus.current;
    if (!kind || !converted || !snapshot) return;
    const select = kind === "audio" ? audioSelect.current : subtitleSelect.current;
    if (!select || select.disabled) return;
    refocus.current = undefined;
    // Only when focus was lost; never take it from another control.
    const focused = document.activeElement;
    if (!focused || focused === document.body) select.focus();
  });

  if (converted) {
    const { tracks, onChange } = converted;
    const choose = (kind: TrackKind, jellyfinIndex: number | undefined) => {
      refocus.current = kind;
      onChangeConverted(() => onChange(kind, jellyfinIndex));
    };
    return (
      <>
        <label className="track-control">
          <AudioLines size={18} />
          <select
            ref={audioSelect}
            aria-label="Audio track"
            value={tracks.audio.find((track) => track.selected)?.jellyfinIndex ?? ""}
            onChange={(event) => choose("audio", Number(event.target.value))}
            disabled={!snapshot || !tracks.audio.length}
          >
            {tracks.audio.map((track) => <option key={track.jellyfinIndex} value={track.jellyfinIndex}>{track.title}</option>)}
          </select>
        </label>
        <label className="track-control">
          <Captions size={18} />
          <select
            ref={subtitleSelect}
            aria-label="Subtitle track"
            value={tracks.subtitle.find((track) => track.selected)?.jellyfinIndex ?? OFF}
            onChange={(event) => choose("subtitle", event.target.value === OFF ? undefined : Number(event.target.value))}
            disabled={!snapshot}
          >
            <option value={OFF}>Subtitles off</option>
            {tracks.subtitle.map((track) => <option key={track.jellyfinIndex} value={track.jellyfinIndex}>{track.title}</option>)}
          </select>
        </label>
      </>
    );
  }

  const audio = snapshot?.tracks.filter((track) => track.type === "Audio") ?? [];
  const subtitles = snapshot?.tracks.filter((track) => track.type === "Subtitle") ?? [];
  return (
    <>
      <label className="track-control">
        <AudioLines size={18} />
        <select
          ref={audioSelect}
          aria-label="Audio track"
          value={audio.find((track) => track.selected)?.playerId ?? ""}
          onChange={(event) => onSelect("audio", Number(event.target.value))}
          disabled={!audio.length}
        >
          {audio.map((track) => <option key={track.playerId} value={track.playerId}>{track.title}</option>)}
        </select>
      </label>
      <label className="track-control">
        <Captions size={18} />
        <select
          ref={subtitleSelect}
          aria-label="Subtitle track"
          value={subtitles.find((track) => track.selected)?.playerId ?? OFF}
          onChange={(event) => onSelect("subtitle", event.target.value === OFF ? undefined : Number(event.target.value))}
        >
          <option value={OFF}>Subtitles off</option>
          {subtitles.map((track) => <option key={track.playerId} value={track.playerId}>{track.title}</option>)}
        </select>
      </label>
    </>
  );
}
