import { describe, expect, it } from "vitest";
import { FLUSTER_PROFILE } from "./device-profile";

describe("FLUSTER_PROFILE", () => {
  it("matches the profile in ARCHITECTURE.md §3", () => {
    expect(FLUSTER_PROFILE).toEqual({
      Name: "Fluster",
      MaxStreamingBitrate: 1000000000,
      MaxStaticBitrate: 1000000000,
      DirectPlayProfiles: [{ Type: "Video" }, { Type: "Audio" }],
      TranscodingProfiles: [],
      ContainerProfiles: [],
      CodecProfiles: [],
      SubtitleProfiles: [
        { Format: "srt", Method: "External" }, { Format: "ass", Method: "External" },
        { Format: "ssa", Method: "External" }, { Format: "vtt", Method: "External" },
        { Format: "sub", Method: "External" }, { Format: "pgssub", Method: "External" },
        { Format: "srt", Method: "Embed" }, { Format: "ass", Method: "Embed" },
        { Format: "ssa", Method: "Embed" }, { Format: "pgssub", Method: "Embed" },
        { Format: "dvdsub", Method: "Embed" }, { Format: "vtt", Method: "Embed" },
      ],
    });
  });

  it("offers no transcoding target and puts no limit on direct-play containers or codecs", () => {
    expect(FLUSTER_PROFILE.TranscodingProfiles).toHaveLength(0);
    for (const profile of FLUSTER_PROFILE.DirectPlayProfiles) {
      expect(Object.keys(profile)).toEqual(["Type"]);
    }
  });

  it("is frozen all the way down", () => {
    expect(Object.isFrozen(FLUSTER_PROFILE)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.DirectPlayProfiles)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.DirectPlayProfiles[0])).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.TranscodingProfiles)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.SubtitleProfiles)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.SubtitleProfiles[0])).toBe(true);
    expect(() => {
      (FLUSTER_PROFILE.TranscodingProfiles as unknown as unknown[]).push({ Type: "Video" });
    }).toThrow();
  });
});
