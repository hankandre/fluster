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
  if (converted) {
    const { tracks, onChange } = converted;
    return (
      <>
        <label className="track-control">
          <AudioLines size={18} />
          <select
            aria-label="Audio track"
            value={tracks.audio.find((track) => track.selected)?.jellyfinIndex ?? ""}
            onChange={(event) => onChangeConverted(() => onChange("audio", Number(event.target.value)))}
            disabled={!snapshot || !tracks.audio.length}
          >
            {tracks.audio.map((track) => <option key={track.jellyfinIndex} value={track.jellyfinIndex}>{track.title}</option>)}
          </select>
        </label>
        <label className="track-control">
          <Captions size={18} />
          <select
            aria-label="Subtitle track"
            value={tracks.subtitle.find((track) => track.selected)?.jellyfinIndex ?? OFF}
            onChange={(event) => onChangeConverted(() => onChange("subtitle", event.target.value === OFF ? undefined : Number(event.target.value)))}
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
