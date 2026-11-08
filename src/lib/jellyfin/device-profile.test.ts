import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLUSTER_PROFILE } from "./device-profile";

const TRANSCODING_PROFILES = [
  {
    Type: "Video",
    Container: "mp4",
    Protocol: "hls",
    Context: "Streaming",
    VideoCodec: "h264,hevc,av1,vp9",
    AudioCodec: "aac,ac3,eac3,opus,flac,mp3",
    EnableSubtitlesInManifest: false,
  },
  { Type: "Audio", Container: "mp4", Protocol: "hls", Context: "Streaming", AudioCodec: "aac" },
];

describe("FLUSTER_PROFILE", () => {
  it("matches the profile in ARCHITECTURE.md §3", () => {
    expect(FLUSTER_PROFILE).toEqual({
      Name: "Fluster",
      MaxStreamingBitrate: 1000000000,
      MaxStaticBitrate: 1000000000,
      DirectPlayProfiles: [{ Type: "Video" }, { Type: "Audio" }],
      TranscodingProfiles: TRANSCODING_PROFILES,
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

  it("puts no condition on direct play, so a codec never causes a conversion", () => {
    expect(FLUSTER_PROFILE.CodecProfiles).toHaveLength(0);
    expect(FLUSTER_PROFILE.ContainerProfiles).toHaveLength(0);
    for (const profile of FLUSTER_PROFILE.DirectPlayProfiles) {
      expect(Object.keys(profile)).toEqual(["Type"]);
    }
  });

  it("offers one HLS streaming target per media type and never subtitles in the manifest", () => {
    expect(FLUSTER_PROFILE.TranscodingProfiles.map((profile) => profile.Type)).toEqual(["Video", "Audio"]);
    for (const profile of FLUSTER_PROFILE.TranscodingProfiles) {
      expect(profile).toMatchObject({ Protocol: "hls", Context: "Streaming", Container: "mp4" });
      expect((profile as { EnableSubtitlesInManifest?: boolean }).EnableSubtitlesInManifest ?? false).toBe(false);
    }
  });

  // HLS subtitle renditions list `subtitles.m3u8?…&ApiKey={token}` in the
  // master playlist (DynamicHlsHelper.cs v10.11.7 line 615).
  it("has no Hls subtitle profile", () => {
    const methods = FLUSTER_PROFILE.SubtitleProfiles.map((profile) => profile.Method.toLowerCase());
    expect(methods).not.toContain("hls");
    expect(new Set(methods)).toEqual(new Set(["external", "embed"]));
  });

  // The P10-02 fixtures were recorded with this profile; a drift here would
  // make them stop describing what the server answers Fluster.
  it("matches the profile the conversion fixtures were recorded with", () => {
    const recorder = readFileSync(join(__dirname, "../../../tests/integration/record-fixtures.mjs"), "utf8");
    for (const profile of FLUSTER_PROFILE.TranscodingProfiles) {
      if (profile.VideoCodec) expect(recorder).toContain(`VideoCodec: "${profile.VideoCodec}"`);
      expect(recorder).toContain(`AudioCodec: "${profile.AudioCodec}"`);
    }
  });

  it("is frozen all the way down", () => {
    expect(Object.isFrozen(FLUSTER_PROFILE)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.DirectPlayProfiles)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.DirectPlayProfiles[0])).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.TranscodingProfiles)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.TranscodingProfiles[0])).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.CodecProfiles)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.ContainerProfiles)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.SubtitleProfiles)).toBe(true);
    expect(Object.isFrozen(FLUSTER_PROFILE.SubtitleProfiles[0])).toBe(true);
    expect(() => {
      (FLUSTER_PROFILE.CodecProfiles as unknown as unknown[]).push({ Type: "Video" });
    }).toThrow();
  });
});
