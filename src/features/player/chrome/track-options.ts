import type { PlaybackSnapshot, PlayerTrack } from "../../../domain/playback";
import type { SourceTrackOption } from "../../../domain/track-choice";
import type { OptionListOption } from "../../shared/ui/option-list";

// A converted session's track lists: every source stream, by Jellyfin index.
export interface ConvertedTracks {
  audio: SourceTrackOption[];
  subtitle: SourceTrackOption[];
}

export const OFF_VALUE = "off";
export const SUBTITLES_OFF_LABEL = "Subtitles off";

export interface TrackRows {
  options: OptionListOption[];
  // The value of the selected row, when one is.
  value: string | undefined;
}

function fromPlayer(tracks: PlayerTrack[]): TrackRows {
  return {
    options: tracks.map((track) => ({ value: String(track.playerId), label: track.title })),
    value: tracks.find((track) => track.selected)?.playerId.toString(),
  };
}

function fromSource(tracks: SourceTrackOption[]): TrackRows {
  return {
    options: tracks.map((track) => ({ value: String(track.jellyfinIndex), label: track.title })),
    value: tracks.find((track) => track.selected)?.jellyfinIndex.toString(),
  };
}

const OFF_ROW: OptionListOption = { value: OFF_VALUE, label: SUBTITLES_OFF_LABEL };

// Direct play lists mpv's tracks and switches by mpv id. A converted session
// lists the source's streams, since the conversion carries only some of them,
// and switches by Jellyfin index.
export function audioRows(snapshot: PlaybackSnapshot | undefined, converted: ConvertedTracks | undefined): TrackRows {
  if (converted) return fromSource(converted.audio);
  return fromPlayer(snapshot?.tracks.filter((track) => track.type === "Audio") ?? []);
}

// Subtitles lead with "Subtitles off"; it is selected when no track is.
export function subtitleRows(snapshot: PlaybackSnapshot | undefined, converted: ConvertedTracks | undefined): TrackRows {
  const rows = converted
    ? fromSource(converted.subtitle)
    : fromPlayer(snapshot?.tracks.filter((track) => track.type === "Subtitle") ?? []);
  return { options: [OFF_ROW, ...rows.options], value: rows.value ?? OFF_VALUE };
}

// The id a row stands for; undefined for the "off" row.
export function trackIdOf(value: string): number | undefined {
  return value === OFF_VALUE ? undefined : Number(value);
}

// The subtitle after the selected one, then off (undefined). Null when there are none.
export function nextSubtitle(tracks: PlayerTrack[]): number | undefined | null {
  const subtitles = tracks.filter((track) => track.type === "Subtitle");
  if (subtitles.length === 0) return null;
  const selected = subtitles.findIndex((track) => track.selected);
  return subtitles[selected + 1]?.playerId;
}
