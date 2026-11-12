import { describe, expect, it } from "vitest";
import type { PlaybackSnapshot, PlayerTrack } from "../../../domain/playback";
import { audioRows, nextSubtitle, subtitleRows, trackIdOf, type ConvertedTracks } from "./track-options";

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
