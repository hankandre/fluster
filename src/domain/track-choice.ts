import { SUBTITLES_OFF, type PlaybackPlan, type PlaybackSnapshot, type PlayerTrack, type StreamSelection } from "./playback";

export type TrackKind = "audio" | "subtitle";

// One of the source's audio or subtitle streams, offered on a converted
// session. `playerId` is set when the running conversion carries the stream
// (mpv lists it, mapped to this Jellyfin index); choosing one without it
// starts a new conversion.
export interface SourceTrackOption {
  jellyfinIndex: number;
  title: string;
  selected: boolean;
  playerId?: number;
}

export type TrackChange =
  // Switch in mpv; an absent playerId turns subtitles off.
  | { kind: "local"; playerId?: number }
  // Start a new conversion with these streams at the current position.
  | { kind: "renegotiate"; selection: StreamSelection }
  | { kind: "none" };

function trackType(kind: TrackKind): PlayerTrack["type"] {
  return kind === "audio" ? "Audio" : "Subtitle";
}

function carried(snapshot: PlaybackSnapshot | undefined, kind: TrackKind, jellyfinIndex: number): PlayerTrack | undefined {
  return snapshot?.tracks.find((track) => track.type === trackType(kind) && track.jellyfinIndex === jellyfinIndex);
}

// The Jellyfin streams playing now: mpv's selected tracks, else the
// server's choice for this plan. A burned-in subtitle is part of the
// picture, so it is the plan's subtitle whatever mpv shows.
export function selectedStreams(plan: PlaybackPlan, snapshot: PlaybackSnapshot | undefined): { audio?: number; subtitle?: number } {
  const selected = (type: PlayerTrack["type"]) => snapshot?.tracks.find((track) => track.type === type && track.selected);
  const audio = selected("Audio")?.jellyfinIndex ?? plan.defaultAudioStreamIndex;
  const burned = plan.subtitlesBurnedIn && plan.defaultSubtitleStreamIndex !== undefined && plan.defaultSubtitleStreamIndex >= 0
    ? plan.defaultSubtitleStreamIndex
    : undefined;
  const subtitle = burned ?? selected("Subtitle")?.jellyfinIndex;
  return { audio, subtitle };
}

// The streams to ask for when renegotiating without a new choice (a limit
// change), so the viewer keeps what is playing.
export function currentSelection(plan: PlaybackPlan, snapshot: PlaybackSnapshot | undefined): StreamSelection {
  const { audio, subtitle } = selectedStreams(plan, snapshot);
  return {
    ...(audio !== undefined ? { audioStreamIndex: audio } : {}),
    subtitleStreamIndex: subtitle ?? SUBTITLES_OFF,
  };
}

// Every source stream of one kind for a converted session, with the ones
// the conversion carries marked by their mpv id.
export function sourceTrackOptions(plan: PlaybackPlan, snapshot: PlaybackSnapshot | undefined, kind: TrackKind): SourceTrackOption[] {
  const current = selectedStreams(plan, snapshot)[kind];
  return plan.tracks
    .filter((track) => track.type === trackType(kind))
    .map((track) => {
      const playerId = carried(snapshot, kind, track.index)?.playerId;
      return {
        jellyfinIndex: track.index,
        title: track.displayTitle,
        selected: track.index === current,
        ...(playerId !== undefined ? { playerId } : {}),
      };
    });
}

// What choosing a Jellyfin stream (undefined: subtitles off) does on a
// converted session. A stream the conversion carries switches in mpv; any
// other, and any change away from burned-in subtitles, renegotiates with the
// other kind kept as it is. Direct play never comes here: it switches in mpv.
export function trackChange(
  plan: PlaybackPlan,
  snapshot: PlaybackSnapshot | undefined,
  kind: TrackKind,
  jellyfinIndex: number | undefined,
): TrackChange {
  if (plan.delivery !== "hls") return { kind: "none" };
  const current = selectedStreams(plan, snapshot);
  const keep = currentSelection(plan, snapshot);

  switch (kind) {
    case "audio": {
      if (jellyfinIndex === undefined || jellyfinIndex === current.audio) return { kind: "none" };
      const track = carried(snapshot, kind, jellyfinIndex);
      if (track) return { kind: "local", playerId: track.playerId };
      return { kind: "renegotiate", selection: { ...keep, audioStreamIndex: jellyfinIndex } };
    }
    case "subtitle": {
      const subtitleStreamIndex = jellyfinIndex ?? SUBTITLES_OFF;
      // Burned-in subtitles stay until a conversion without them (or with
      // another one) replaces this one, even when the burned index is unknown.
      if (plan.subtitlesBurnedIn) {
        if (jellyfinIndex !== undefined && jellyfinIndex === current.subtitle) return { kind: "none" };
        return { kind: "renegotiate", selection: { ...keep, subtitleStreamIndex } };
      }
      if (jellyfinIndex === current.subtitle) return { kind: "none" };
      if (jellyfinIndex === undefined) return { kind: "local" };
      const track = carried(snapshot, kind, jellyfinIndex);
      if (track) return { kind: "local", playerId: track.playerId };
      return { kind: "renegotiate", selection: { ...keep, subtitleStreamIndex } };
    }
  }
}

// The subtitle after the selected one in a converted session's source list,
// then off (undefined). Null when the source has none.
export function nextSourceSubtitle(options: SourceTrackOption[]): number | undefined | null {
  if (options.length === 0) return null;
  const selected = options.findIndex((option) => option.selected);
  return options[selected + 1]?.jellyfinIndex;
}
