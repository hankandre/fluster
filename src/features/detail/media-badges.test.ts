import { describe, expect, it } from "vitest";
import type { ItemVersion } from "../../domain/catalog";
import { isFourK, mediaBadges, rangeLabel, versionSummary } from "./media-badges";

const fourK: ItemVersion = {
  id: "src-4k",
  name: "4K HDR",
  video: { codec: "hevc", width: 3840, height: 2160, hdr: "Dolby Vision / HDR10" },
  audio: [
    { language: "fra", codec: "aac", channels: 2, isDefault: false },
    { language: "eng", codec: "truehd", channels: 8, title: "English TrueHD Atmos 7.1", isDefault: true },
  ],
  subtitles: [
    { language: "eng", codec: "subrip", isExternal: false, isDefault: true, isForced: false },
    { language: "eng", codec: "pgssub", isExternal: false, isDefault: false, isForced: false },
    { language: "fra", codec: "pgssub", isExternal: false, isDefault: false, isForced: false },
    { language: "eng", codec: "ass", isExternal: true, isDefault: false, isForced: false },
  ],
};

const hd: ItemVersion = {
  id: "src-hd",
  name: "1080p",
  video: { codec: "h264", width: 1920, height: 1080, hdr: "SDR" },
  audio: [{ language: "eng", codec: "aac", channels: 2, isDefault: true }],
  subtitles: [{ language: "eng", codec: "subrip", isExternal: false, isDefault: false, isForced: false }],
};

describe("mediaBadges", () => {
  it("gives the 4K source its five badges in order", () => {
    expect(mediaBadges(fourK)).toEqual(["4K", "Dolby Vision", "TrueHD 7.1", "Atmos", "PGS · ASS"]);
  });

  it("gives 1080p SDR the audio badge only, with no SRT", () => {
    expect(mediaBadges(hd)).toEqual(["AAC Stereo"]);
  });

  it("shows Atmos only when the track title says so", () => {
    const plain = { ...fourK, audio: [{ language: "eng", codec: "truehd", channels: 8, title: "English TrueHD 7.1", isDefault: true }] };
    expect(mediaBadges(plain)).not.toContain("Atmos");
  });

  it("falls back to the first audio track and never exceeds five badges", () => {
    const noDefault = { ...fourK, audio: [{ language: "eng", codec: "eac3", channels: 6, isDefault: false }] };
    expect(mediaBadges(noDefault)).toContain("E-AC-3 5.1");
    expect(mediaBadges(fourK).length).toBeLessThanOrEqual(5);
  });

  it("is empty for a version with no video, audio, or subtitles", () => {
    expect(mediaBadges({ id: "x", name: "x", audio: [], subtitles: [] })).toEqual([]);
  });
});

describe("versionSummary and helpers", () => {
  it("joins the badges", () => {
    expect(versionSummary(hd)).toBe("AAC Stereo");
    expect(versionSummary(fourK)).toBe("4K · Dolby Vision · TrueHD 7.1 · Atmos · PGS · ASS");
  });

  it("labels ranges and 4K", () => {
    expect(rangeLabel("HDR10+")).toBe("HDR10+");
    expect(rangeLabel("SDR")).toBeUndefined();
    expect(rangeLabel("Unknown")).toBeUndefined();
    expect(isFourK(3200)).toBe(true);
    expect(isFourK(1920)).toBe(false);
    expect(isFourK(undefined)).toBe(false);
  });
});
