// T2-05 acceptance item 3: player capabilities are a typed list (which codecs decode in hardware, HDR types,
// passthrough formats) that an engine fills in. Only known values cross; anything unreadable is "cannot tell".
import { describe, expect, it } from "vitest";
import { createFakePlayerEngine } from "../player/fake-player-engine";
import { readCapabilities } from "./player-capabilities";

function nativeAnswer() {
  return {
    probe: "complete",
    videoDecoders: [
      { codec: "h264", hardware: true, profile: "High", maxBitDepth: 8, maxWidth: 3840, maxHeight: 2160 },
      { codec: "hevc", hardware: true, profile: "Main 10", maxBitDepth: 10 },
      { codec: "av1", hardware: false, maxBitDepth: 12 },
      { codec: "vp9", hardware: false },
    ],
    audioDecoders: ["aac", "mp3", "eac3", "truehd", "flac"],
    hdr: ["hdr10", "hlg", "dolby-vision"],
    passthrough: ["ac3", "eac3", "eac3-joc", "dts-hd"],
  };
}

describe("readCapabilities", () => {
  it("keeps a complete native answer as the typed value", () => {
    expect(readCapabilities(nativeAnswer())).toEqual(nativeAnswer());
  });

  it("keeps a complete probe that found nothing apart from a failed one", () => {
    const empty = { probe: "complete", videoDecoders: [], audioDecoders: [], hdr: [], passthrough: [] };
    expect(readCapabilities(empty)).toEqual(empty);
  });

  it.each([
    ["an unknown video codec", (raw: ReturnType<typeof nativeAnswer>) => {
      (raw.videoDecoders as unknown[]).push({ codec: "xyz", hardware: true });
    }],
    ["an unknown audio codec", (raw: ReturnType<typeof nativeAnswer>) => {
      raw.audioDecoders.push("xyz");
    }],
    ["an unknown HDR type", (raw: ReturnType<typeof nativeAnswer>) => {
      raw.hdr.push("hdr11");
    }],
    ["a format that is not a passthrough format", (raw: ReturnType<typeof nativeAnswer>) => {
      raw.passthrough.push("mp3");
    }],
    ["a video decoder whose hardware flag is not a boolean", (raw: ReturnType<typeof nativeAnswer>) => {
      (raw.videoDecoders as unknown[]).push({ codec: "vp8", hardware: "yes" });
    }],
    ["a video decoder that is not an object", (raw: ReturnType<typeof nativeAnswer>) => {
      (raw.videoDecoders as unknown[]).push("h264");
    }],
  ])("drops %s and keeps the rest", (_name, spoil) => {
    const raw = nativeAnswer();
    spoil(raw);
    expect(readCapabilities(raw)).toEqual(nativeAnswer());
  });

  it.each([
    ["a profile with a newline", { profile: "Main\n10" }],
    ["a 200-character profile", { profile: "M".repeat(200) }],
    ["a bit depth of 9", { maxBitDepth: 9 }],
    ["a zero width", { maxWidth: 0 }],
    ["a fractional height", { maxHeight: 1080.5 }],
  ])("drops %s from a decoder and keeps the decoder", (_name, field) => {
    const raw = nativeAnswer();
    (raw.videoDecoders as unknown[]).push({ codec: "mpeg2video", hardware: true, ...field });
    const expected = nativeAnswer();
    (expected.videoDecoders as unknown[]).push({ codec: "mpeg2video", hardware: true });
    expect(readCapabilities(raw)).toEqual(expected);
  });

  it("drops duplicates", () => {
    const raw = nativeAnswer();
    raw.videoDecoders.push({ codec: "vp9", hardware: false });
    raw.audioDecoders.push("aac");
    raw.hdr.push("hdr10");
    raw.passthrough.push("ac3");
    expect(readCapabilities(raw)).toEqual(nativeAnswer());
  });

  it.each([
    ["null", null],
    ["a string", "text"],
    ["a failed probe", { probe: "failed" }],
    ["a list that is not an array", { videoDecoders: "x" }],
    ["a missing list", { probe: "complete", videoDecoders: [], audioDecoders: [], hdr: [] }],
  ])("reads %s as cannot tell", (_name, raw) => {
    expect(readCapabilities(raw)).toEqual({ probe: "failed" });
  });

  it("passes an engine's own answer through unchanged, so an engine fills it in", async () => {
    const capabilities = await createFakePlayerEngine().engine.initialize();
    expect(capabilities.probe).toBe("complete");
    expect(readCapabilities(capabilities)).toEqual(capabilities);
  });
});
