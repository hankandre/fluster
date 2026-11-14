import { describe, expect, it } from "vitest";
import type { MediaTrack, PlayerTrack } from "../../../domain/playback";
import { trackFactsFromPlan, trackFactsFromPlayer, trackRow, type TrackFacts } from "./track-label";

function facts(overrides: Partial<TrackFacts>): TrackFacts {
  return {
    kind: "Audio",
    fallbackTitle: "Audio 1",
    isDefault: false,
    isForced: false,
    isHearingImpaired: false,
    external: false,
    ...overrides,
  };
}

describe("trackRow", () => {
  it("names an audio track by language, with the format and default flag", () => {
    expect(trackRow(facts({ language: "eng", codec: "truehd", channels: 8, isDefault: true }))).toEqual({
      name: "English",
      detail: "TrueHD 7.1 · default",
    });
  });

  it("uses a title that already holds the language as the name", () => {
    expect(trackRow(facts({ language: "eng", title: "English stereo", codec: "aac", channels: 2 })).name).toBe("English stereo");
    expect(trackRow(facts({ language: "eng", title: "english sdh", kind: "Subtitle" })).name).toBe("english sdh");
  });

  it("joins a different title to the language", () => {
    expect(trackRow(facts({ language: "eng", title: "Commentary", codec: "ac3", channels: 6 }))).toEqual({
      name: "English · Commentary",
      detail: "AC-3 5.1",
    });
  });

  it("lists every subtitle flag in order", () => {
    const all = trackRow(facts({
      kind: "Subtitle",
      language: "eng",
      codec: "subrip",
      isForced: true,
      isHearingImpaired: true,
      isDefault: true,
      external: true,
    }));
    expect(all).toEqual({ name: "English", detail: "SRT · forced · hard of hearing · default · external" });
  });

  it("shows each flag alone", () => {
    const flag = (overrides: Partial<TrackFacts>) => trackRow(facts({ kind: "Subtitle", language: "eng", ...overrides })).detail;
    expect(flag({ isForced: true })).toBe("forced");
    expect(flag({ isHearingImpaired: true })).toBe("hard of hearing");
    expect(flag({ isDefault: true })).toBe("default");
    expect(flag({ external: true })).toBe("external");
  });

  it("has one line with no format and no flags", () => {
    expect(trackRow(facts({ language: "eng" }))).toEqual({ name: "English" });
  });

  it("upper-cases an unknown codec", () => {
    expect(trackRow(facts({ language: "eng", codec: "weird" })).detail).toBe("WEIRD");
  });

  it("uses the title, then the fallback, for no language or und", () => {
    expect(trackRow(facts({ language: "und", title: "Original" })).name).toBe("Original");
    expect(trackRow(facts({ title: "Original" })).name).toBe("Original");
    expect(trackRow(facts({ language: "und", fallbackTitle: "Track 3" })).name).toBe("Track 3");
    expect(trackRow(facts({ fallbackTitle: "Track 3" })).name).toBe("Track 3");
  });

  it("never shows a delivery URL or play-session ID", () => {
    const track: MediaTrack = {
      index: 3,
      type: "Subtitle",
      displayTitle: "English - SRT",
      codec: "subrip",
      language: "eng",
      external: true,
      deliveryUrl: "https://media.test/Videos/x/Subtitles/3/0/Stream.srt?ApiKey=secret",
    };
    const row = trackRow(trackFactsFromPlan(track));
    const text = `${row.name} ${row.detail}`;
    expect(text).not.toContain("media.test");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("PlaySessionId");
  });
});

describe("track facts", () => {
  it("reads a plan track", () => {
    const track: MediaTrack = {
      index: 1,
      type: "Audio",
      displayTitle: "Spanish 5.1 - AC3",
      codec: "ac3",
      language: "spa",
      external: false,
      channels: 6,
      title: "Spanish 5.1",
    };
    expect(trackRow(trackFactsFromPlan(track))).toEqual({ name: "Spanish 5.1", detail: "AC-3 5.1" });
  });

  it("reads an mpv track with only its title, language, and external flag", () => {
    const track: PlayerTrack = { playerId: 2, type: "Subtitle", title: "Commentary", language: "fre", external: true, selected: false };
    expect(trackRow(trackFactsFromPlayer(track))).toEqual({ name: "French · Commentary", detail: "external" });
    expect(trackRow(trackFactsFromPlayer({ ...track, language: undefined })).name).toBe("Commentary");
  });
});
