import { describe, expect, it } from "vitest";
import type { MediaTrack, PlaybackPlan, PlaybackSnapshot, PlayerTrack } from "./playback";
import { currentSelection, sourceTrackOptions, trackChange } from "./track-choice";

// Source: video 0, English audio 1, French audio 2, English SRT 3 (delivered
// as a file while converting), PGS 4 (image: only by burning in).
const tracks: MediaTrack[] = [
  { index: 0, type: "Video", displayTitle: "H.264", external: false },
  { index: 1, type: "Audio", displayTitle: "English", external: false },
  { index: 2, type: "Audio", displayTitle: "French", external: false },
  { index: 3, type: "Subtitle", displayTitle: "English SRT", external: false, deliveryUrl: "https://media.test/sub.srt" },
  { index: 4, type: "Subtitle", displayTitle: "English PGS", external: false },
];

function converting(overrides: Partial<PlaybackPlan> = {}): PlaybackPlan {
  return {
    itemId: "m1",
    title: "Arrival",
    streamUrl: "https://media.test/videos/m1/master.m3u8",
    mediaSourceId: "src",
    playSessionId: "play-1",
    startPositionTicks: 0,
    tracks,
    defaultAudioStreamIndex: 1,
    delivery: "hls",
    playMethod: "Transcode",
    conversionReasons: ["AudioCodecNotSupported"],
    serverUrl: "https://media.test",
    mediaKind: "videos",
    ...overrides,
  } as PlaybackPlan;
}

// What mpv lists on that conversion: the one requested audio and the SRT.
function snapshot(selectedSubtitle = false, extra: PlayerTrack[] = []): PlaybackSnapshot {
  return {
    positionSeconds: 42,
    paused: false,
    buffering: false,
    volume: 100,
    muted: false,
    tracks: [
      { playerId: 1, jellyfinIndex: 1, type: "Audio", title: "English", external: false, selected: true },
      { playerId: 1, jellyfinIndex: 3, type: "Subtitle", title: "English SRT", external: true, selected: selectedSubtitle },
      ...extra,
    ],
    diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
  };
}

describe("sourceTrackOptions", () => {
  it("lists every source stream and marks the ones the conversion carries", () => {
    expect(sourceTrackOptions(converting(), snapshot(true), "audio")).toEqual([
      { jellyfinIndex: 1, title: "English", selected: true, playerId: 1 },
      { jellyfinIndex: 2, title: "French", selected: false },
    ]);
    expect(sourceTrackOptions(converting(), snapshot(true), "subtitle")).toEqual([
      { jellyfinIndex: 3, title: "English SRT", selected: true, playerId: 1 },
      { jellyfinIndex: 4, title: "English PGS", selected: false },
    ]);
  });

  it("shows a burned-in subtitle as selected though mpv lists nothing for it", () => {
    const plan = converting({ subtitlesBurnedIn: true, defaultSubtitleStreamIndex: 4 });
    expect(sourceTrackOptions(plan, snapshot(), "subtitle").find((track) => track.selected)?.jellyfinIndex).toBe(4);
  });
});

describe("trackChange", () => {
  it("switches in mpv to an audio stream the conversion carries", () => {
    const extra: PlayerTrack = { playerId: 2, jellyfinIndex: 2, type: "Audio", title: "French", external: false, selected: false };
    expect(trackChange(converting(), snapshot(false, [extra]), "audio", 2)).toEqual({ kind: "local", playerId: 2 });
  });

  it("renegotiates for an audio stream the conversion lacks, keeping the subtitle", () => {
    expect(trackChange(converting(), snapshot(true), "audio", 2)).toEqual({
      kind: "renegotiate",
      selection: { audioStreamIndex: 2, subtitleStreamIndex: 3 },
    });
    expect(trackChange(converting(), snapshot(false), "audio", 2)).toEqual({
      kind: "renegotiate",
      selection: { audioStreamIndex: 2, subtitleStreamIndex: -1 },
    });
  });

  it("switches in mpv to a carried subtitle and turns subtitles off locally", () => {
    expect(trackChange(converting(), snapshot(false), "subtitle", 3)).toEqual({ kind: "local", playerId: 1 });
    expect(trackChange(converting(), snapshot(true), "subtitle", undefined)).toEqual({ kind: "local" });
  });

  it("renegotiates for a subtitle the conversion lacks, keeping the audio", () => {
    expect(trackChange(converting(), snapshot(false), "subtitle", 4)).toEqual({
      kind: "renegotiate",
      selection: { audioStreamIndex: 1, subtitleStreamIndex: 4 },
    });
  });

  it("renegotiates without burn-in when subtitles are turned off or switched while burned in", () => {
    const plan = converting({ subtitlesBurnedIn: true, defaultSubtitleStreamIndex: 4 });
    expect(trackChange(plan, snapshot(), "subtitle", undefined)).toEqual({
      kind: "renegotiate",
      selection: { audioStreamIndex: 1, subtitleStreamIndex: -1 },
    });
    // Even a carried text subtitle needs a new conversion: the burned one is in the picture.
    expect(trackChange(plan, snapshot(), "subtitle", 3)).toEqual({
      kind: "renegotiate",
      selection: { audioStreamIndex: 1, subtitleStreamIndex: 3 },
    });
    // An unknown burned index still renegotiates for off.
    expect(trackChange(converting({ subtitlesBurnedIn: true }), snapshot(), "subtitle", undefined).kind).toBe("renegotiate");
  });

  it("does nothing for the stream already playing", () => {
    expect(trackChange(converting(), snapshot(), "audio", 1)).toEqual({ kind: "none" });
    expect(trackChange(converting(), snapshot(false), "subtitle", undefined)).toEqual({ kind: "none" });
    const burned = converting({ subtitlesBurnedIn: true, defaultSubtitleStreamIndex: 4 });
    expect(trackChange(burned, snapshot(), "subtitle", 4)).toEqual({ kind: "none" });
  });

  it("never renegotiates direct play", () => {
    const direct = { ...converting(), delivery: "static", playMethod: "DirectPlay", conversionReasons: [] } as PlaybackPlan;
    expect(trackChange(direct, snapshot(), "audio", 2)).toEqual({ kind: "none" });
  });
});

describe("currentSelection", () => {
  it("keeps the playing audio and subtitle, or asks for no subtitle", () => {
    expect(currentSelection(converting(), snapshot(true))).toEqual({ audioStreamIndex: 1, subtitleStreamIndex: 3 });
    expect(currentSelection(converting(), snapshot(false))).toEqual({ audioStreamIndex: 1, subtitleStreamIndex: -1 });
  });
});
