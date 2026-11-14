import { describe, expect, it } from "vitest";
import type { MediaTrack, PlaybackSnapshot, PlayerTrack } from "../../../domain/playback";
import { audioRows, nextSubtitle, subtitleRows, trackIdOf, type ConvertedTracks, type TrackRows } from "./track-options";

function track(playerId: number, type: PlayerTrack["type"], title: string, selected = false): PlayerTrack {
  return { playerId, jellyfinIndex: playerId + 10, type, title, external: false, selected };
}

function snapshotWith(tracks: PlayerTrack[]): PlaybackSnapshot {
  return {
    positionSeconds: 0,
    paused: false,
    buffering: false,
    volume: 100,
    muted: false,
    tracks,
    diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
  };
}

const converted: ConvertedTracks = {
  audio: [
    { jellyfinIndex: 1, title: "English", selected: true },
    { jellyfinIndex: 2, title: "French", selected: false },
  ],
  subtitle: [
    { jellyfinIndex: 3, title: "English SRT", selected: false },
    { jellyfinIndex: 4, title: "English PGS", selected: false },
  ],
};

describe("track options", () => {
  it("lists mpv's tracks by player id for direct play, with the selected one", () => {
    const snapshot = snapshotWith([track(1, "Audio", "English", true), track(2, "Audio", "French"), track(3, "Subtitle", "English SRT")]);
    expect(audioRows(snapshot, undefined)).toEqual({
      options: [{ value: "1", label: "English" }, { value: "2", label: "French" }],
      value: "1",
    });
    expect(subtitleRows(snapshot, undefined)).toEqual({
      options: [{ value: "off", label: "Subtitles off" }, { value: "3", label: "English SRT" }],
      value: "off",
    });
  });

  it("selects the chosen subtitle instead of off", () => {
    const snapshot = snapshotWith([track(3, "Subtitle", "English SRT", true)]);
    expect(subtitleRows(snapshot, undefined).value).toBe("3");
  });

  it("lists the source's streams by Jellyfin index for a converted session", () => {
    expect(audioRows(undefined, converted).options.map((option) => option.label)).toEqual(["English", "French"]);
    expect(audioRows(undefined, converted).value).toBe("1");
    expect(subtitleRows(undefined, converted).options.map((option) => option.label)).toEqual(["Subtitles off", "English SRT", "English PGS"]);
    expect(subtitleRows(undefined, converted).value).toBe("off");
  });

  it("has an empty audio list and only the off row without a snapshot", () => {
    expect(audioRows(undefined, undefined)).toEqual({ options: [], value: undefined });
    expect(subtitleRows(undefined, undefined).options).toHaveLength(1);
  });

  it("maps a row back to an id, with off as undefined", () => {
    expect(trackIdOf("off")).toBeUndefined();
    expect(trackIdOf("4")).toBe(4);
  });

  it("finds the subtitle after the selected one, then off, and null when there are none", () => {
    const subtitles = [track(3, "Subtitle", "English"), track(4, "Subtitle", "French", true)];
    expect(nextSubtitle(subtitles)).toBeUndefined();
    expect(nextSubtitle(subtitles.map((item) => ({ ...item, selected: false })))).toBe(3);
    expect(nextSubtitle([track(1, "Audio", "English")])).toBeNull();
  });
});

describe("track rows from the plan's stream facts", () => {
  const planTracks: MediaTrack[] = [
    { index: 11, type: "Audio", displayTitle: "English stereo - AAC - Default", codec: "aac", language: "eng", external: false, channels: 2, isDefault: true },
    { index: 12, type: "Subtitle", displayTitle: "English - SRT", codec: "subrip", language: "eng", external: false },
    { index: 13, type: "Subtitle", displayTitle: "English - SRT - Forced", codec: "subrip", language: "eng", external: false, isForced: true },
    { index: 14, type: "Subtitle", displayTitle: "Plain - PGS", codec: "pgssub", external: false },
  ];
  const direct = snapshotWith([
    { ...track(1, "Audio", "mpv audio", true), language: "eng" },
    { ...track(2, "Subtitle", "mpv a"), language: "eng" },
    { ...track(3, "Subtitle", "mpv b"), language: "eng" },
  ]);
  const convertedFromPlan: ConvertedTracks = {
    audio: [{ jellyfinIndex: 11, title: "English stereo - AAC - Default", selected: true }],
    subtitle: [
      { jellyfinIndex: 12, title: "English - SRT", selected: false },
      { jellyfinIndex: 13, title: "English - SRT - Forced", selected: false },
    ],
  };
  const labels = (rows: TrackRows) => rows.options.map(({ label, description }) => [label, description]);

  it("gives a direct-play session and a converted session the same rows", () => {
    expect(labels(audioRows(direct, undefined, planTracks))).toEqual([["English", "AAC Stereo · default"]]);
    expect(labels(audioRows(undefined, convertedFromPlan, planTracks))).toEqual(labels(audioRows(direct, undefined, planTracks)));
    expect(labels(subtitleRows(direct, undefined, planTracks))).toEqual(labels(subtitleRows(undefined, convertedFromPlan, planTracks)));
  });

  it("tells two English subtitles apart by the forced flag", () => {
    expect(labels(subtitleRows(direct, undefined, planTracks))).toEqual([
      ["Subtitles off", undefined],
      ["English", "SRT"],
      ["English", "SRT · forced"],
    ]);
  });

  it("keeps mpv's own title for a track the plan does not map (title source 1)", () => {
    const unmapped = snapshotWith([track(5, "Audio", "Director's cut", true)]);
    expect(labels(audioRows(unmapped, undefined, planTracks))).toEqual([["Director's cut", undefined]]);
  });

  it("uses Jellyfin's display title for a plan track with no language or title (title source 2)", () => {
    const one: ConvertedTracks = { audio: [], subtitle: [{ jellyfinIndex: 14, title: "Plain - PGS", selected: false }] };
    expect(labels(subtitleRows(undefined, one, planTracks))).toEqual([["Subtitles off", undefined], ["Plain - PGS", "PGS"]]);
  });

  it("falls back to the option's title when the plan has no such stream", () => {
    expect(labels(audioRows(undefined, converted, undefined))).toEqual([["English", undefined], ["French", undefined]]);
  });
});
