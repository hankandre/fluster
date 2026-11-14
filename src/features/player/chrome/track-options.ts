import type { MediaTrack, PlaybackSnapshot, PlayerTrack } from "../../../domain/playback";
import type { SourceTrackOption } from "../../../domain/track-choice";
import type { OptionListOption } from "../../shared/ui/option-list";
import { trackFactsFromPlan, trackFactsFromPlayer, trackRow, type TrackFacts } from "./track-label";

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

function rowOf(value: string, facts: TrackFacts): OptionListOption {
  const { name, detail } = trackRow(facts);
  return { value, label: name, ...(detail ? { description: detail } : {}) };
}

function fromPlayer(tracks: PlayerTrack[], planTracks: readonly MediaTrack[] | undefined): TrackRows {
  return {
    options: tracks.map((track) => {
      const planTrack = track.jellyfinIndex === undefined
        ? undefined
        : planTracks?.find((candidate) => candidate.index === track.jellyfinIndex && candidate.type === track.type);
      return rowOf(String(track.playerId), planTrack ? trackFactsFromPlan(planTrack) : trackFactsFromPlayer(track));
    }),
    value: tracks.find((track) => track.selected)?.playerId.toString(),
  };
}

function fromSource(
  tracks: SourceTrackOption[],
  planTracks: readonly MediaTrack[] | undefined,
  kind: TrackFacts["kind"],
): TrackRows {
  return {
    options: tracks.map((track) => {
      const planTrack = planTracks?.find((candidate) => candidate.index === track.jellyfinIndex);
      const facts: TrackFacts = planTrack
        ? trackFactsFromPlan(planTrack)
        : { kind, fallbackTitle: track.title, isDefault: false, isForced: false, isHearingImpaired: false, external: false };
      return rowOf(String(track.jellyfinIndex), facts);
    }),
    value: tracks.find((track) => track.selected)?.jellyfinIndex.toString(),
  };
}

const OFF_ROW: OptionListOption = { value: OFF_VALUE, label: SUBTITLES_OFF_LABEL };

// Direct play lists mpv's tracks and switches by mpv id. A converted session
// lists the source's streams, since the conversion carries only some of them,
// and switches by Jellyfin index. Both label a row from the plan's stream facts.
export function audioRows(
  snapshot: PlaybackSnapshot | undefined,
  converted: ConvertedTracks | undefined,
  planTracks?: readonly MediaTrack[],
): TrackRows {
  if (converted) return fromSource(converted.audio, planTracks, "Audio");
  return fromPlayer(snapshot?.tracks.filter((track) => track.type === "Audio") ?? [], planTracks);
}

// Subtitles lead with "Subtitles off"; it is selected when no track is.
export function subtitleRows(
  snapshot: PlaybackSnapshot | undefined,
  converted: ConvertedTracks | undefined,
  planTracks?: readonly MediaTrack[],
): TrackRows {
  const rows = converted
    ? fromSource(converted.subtitle, planTracks, "Subtitle")
    : fromPlayer(snapshot?.tracks.filter((track) => track.type === "Subtitle") ?? [], planTracks);
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
