import { describe, expect, it } from "vitest";
import {
  audioCodecLabel,
  audioOutputLabel,
  channelsLabel,
  rangeLabel,
  resolutionLabel,
  videoCodecLabel,
} from "./stream-facts";

describe("stream facts labels", () => {
  it("names codecs, and upper-cases an unknown one", () => {
    expect(videoCodecLabel({ codec: "hevc", range: "unknown" })).toBe("HEVC");
    expect(audioCodecLabel({ codec: "truehd" })).toBe("TrueHD");
    expect(audioCodecLabel({ codec: "weirdcodec" })).toBe("WEIRDCODEC");
    expect(videoCodecLabel(undefined)).toBeUndefined();
    expect(audioCodecLabel({})).toBeUndefined();
  });

  it("joins the resolution with a multiplication sign, and needs both sides", () => {
    const base = { decodeMode: "hardware" as const, decodeLabel: "x", droppedFrames: 0 };
    expect(resolutionLabel({ ...base, width: 3840, height: 2160 })).toBe("3840×2160");
    expect(resolutionLabel({ ...base, width: 3840 })).toBeUndefined();
    expect(resolutionLabel(undefined)).toBeUndefined();
  });

  it("labels the range with and without bit depth", () => {
    expect(rangeLabel({ range: "sdr" }, undefined)).toBe("SDR");
    expect(rangeLabel({ range: "pq" }, 10)).toBe("HDR (PQ) · 10-bit");
    expect(rangeLabel({ range: "hlg" }, 10)).toBe("HDR (HLG) · 10-bit");
    expect(rangeLabel({ range: "unknown" }, 10)).toBeUndefined();
    expect(rangeLabel(undefined, 10)).toBeUndefined();
  });

  it("labels Dolby Vision with and without a profile", () => {
    expect(rangeLabel({ range: "dolby-vision", dolbyVisionProfile: 8 }, 10)).toBe("Dolby Vision, profile 8 · 10-bit");
    expect(rangeLabel({ range: "dolby-vision" }, undefined)).toBe("Dolby Vision");
  });

  it("labels channels with the sample rate", () => {
    expect(channelsLabel({ channelCount: 8, sampleRate: 48000 })).toBe("7.1 · 48 kHz");
    expect(channelsLabel({ channelCount: 2, sampleRate: 44100 })).toBe("Stereo · 44.1 kHz");
    expect(channelsLabel({ channelCount: 6 })).toBe("5.1");
    expect(channelsLabel({ sampleRate: 48000 })).toBeUndefined();
  });

  it("labels PCM output and passthrough", () => {
    expect(audioOutputLabel({ outputFormat: "floatp", outputChannelCount: 8 })).toBe("PCM, 7.1");
    expect(audioOutputLabel({ outputFormat: "floatp" })).toBe("PCM");
    expect(audioOutputLabel({ outputFormat: "spdif-eac3" })).toBe("Passthrough (E-AC-3)");
    expect(audioOutputLabel({})).toBeUndefined();
  });
});
