import { describe, expect, it } from "vitest";
import { fakeCapabilities } from "../player/fake-player-engine";
import { devicePlayability, type SourceFormat } from "./device-capabilities";
import type { AudioCodec, PassthroughFormat, PlayerCapabilities, VideoDecoder } from "./player-engine";

// T2-07 item 1: the device-capability rule the source decision reads (spec "Playability").
function complete(videoDecoders: VideoDecoder[], audioDecoders: AudioCodec[] = ["aac"], passthrough: PassthroughFormat[] = []): PlayerCapabilities {
  return { probe: "complete", videoDecoders, audioDecoders, hdr: [], passthrough };
}

const h264: VideoDecoder = { codec: "h264", hardware: true };
const playable = (format: SourceFormat, capabilities: Parameters<typeof devicePlayability>[1]) => {
  const { video, audio } = devicePlayability(format, capabilities);
  return video && audio;
};

describe("T2-07 item 1: devicePlayability states", () => {
  it('treats "full" as able to play anything, even a source that states nothing', () => {
    expect(devicePlayability({}, "full")).toEqual({ video: true, audio: true });
    expect(devicePlayability({ video: { codec: "prores" }, audio: { codec: "wmapro" } }, "full")).toEqual({ video: true, audio: true });
  });

  it("plays nothing when the probe failed", () => {
    expect(playable({ video: { codec: "h264" }, audio: { codec: "aac" } }, { probe: "failed" })).toBe(false);
    expect(devicePlayability({ video: { codec: "h264" } }, { probe: "failed" }).video).toBe(false);
    expect(devicePlayability({ audio: { codec: "aac" } }, { probe: "failed" }).audio).toBe(false);
  });
});

describe("T2-07 item 1: devicePlayability video", () => {
  const caps = complete([h264]);

  it("plays a codec the list holds and not one it lacks", () => {
    expect(devicePlayability({ video: { codec: "h264" }, audio: { codec: "aac" } }, caps)).toEqual({ video: true, audio: true });
    expect(devicePlayability({ video: { codec: "hevc" }, audio: { codec: "aac" } }, caps)).toEqual({ video: false, audio: true });
  });

  it("compares the codec in lower case", () => {
    expect(devicePlayability({ video: { codec: "H264" } }, caps).video).toBe(true);
  });

  it("counts a software decoder as it counts a hardware one", () => {
    expect(devicePlayability({ video: { codec: "av1" } }, complete([{ codec: "av1", hardware: false }])).video).toBe(true);
  });

  it("matches a decoder that states no profile against any profile or none", () => {
    expect(devicePlayability({ video: { codec: "h264", profile: "Baseline" } }, caps).video).toBe(true);
    expect(devicePlayability({ video: { codec: "h264" } }, caps).video).toBe(true);
  });

  it("matches a stated profile case-insensitively and trimmed, and refuses another or a missing one", () => {
    const high = complete([{ codec: "h264", hardware: true, profile: "High" }]);
    expect(devicePlayability({ video: { codec: "h264", profile: "High" } }, high).video).toBe(true);
    expect(devicePlayability({ video: { codec: "h264", profile: " high " } }, high).video).toBe(true);
    expect(devicePlayability({ video: { codec: "h264", profile: "Main" } }, high).video).toBe(false);
    expect(devicePlayability({ video: { codec: "h264" } }, high).video).toBe(false);
  });

  it.each([
    ["maxBitDepth", "bitDepth", 8, 8, 10],
    ["maxWidth", "width", 1280, 1280, 1920],
    ["maxHeight", "height", 720, 720, 1080],
  ] as const)("keeps a stream within %s and refuses one above it", (limit, field, max, atLimit, over) => {
    const caps = complete([{ codec: "h264", hardware: true, [limit]: max } as VideoDecoder]);
    expect(devicePlayability({ video: { codec: "h264", [field]: atLimit - 1 } }, caps).video).toBe(true);
    expect(devicePlayability({ video: { codec: "h264", [field]: atLimit } }, caps).video).toBe(true);
    expect(devicePlayability({ video: { codec: "h264", [field]: over } }, caps).video).toBe(false);
  });

  it.each([
    ["maxBitDepth", 8],
    ["maxWidth", 1280],
    ["maxHeight", 720],
  ] as const)("refuses a stream whose value a decoder's %s limits and the source does not give", (limit, max) => {
    const caps = complete([{ codec: "h264", hardware: true, [limit]: max } as VideoDecoder]);
    expect(devicePlayability({ video: { codec: "h264" } }, caps).video).toBe(false);
  });

  it("uses a value only for the limits the decoder states", () => {
    expect(devicePlayability({ video: { codec: "h264" } }, complete([{ codec: "h264", hardware: true, maxWidth: 1280 }])).video).toBe(false);
    expect(devicePlayability({ video: { codec: "h264", width: 640 } }, complete([{ codec: "h264", hardware: true, maxWidth: 1280 }])).video).toBe(true);
  });

  it("plays when any decoder of the codec matches", () => {
    const caps = complete([
      { codec: "hevc", hardware: true, profile: "Main", maxBitDepth: 8 },
      { codec: "hevc", hardware: false, profile: "Main 10", maxBitDepth: 10 },
    ]);
    expect(devicePlayability({ video: { codec: "hevc", profile: "Main 10", bitDepth: 10 } }, caps).video).toBe(true);
    expect(devicePlayability({ video: { codec: "hevc", profile: "Rext", bitDepth: 10 } }, caps).video).toBe(false);
  });

  it("refuses a codec outside the capability vocabulary and a stream without a codec", () => {
    expect(devicePlayability({ video: { codec: "prores" } }, caps).video).toBe(false);
    expect(devicePlayability({ video: {} }, caps).video).toBe(false);
  });
});

describe("T2-07 item 1: devicePlayability audio", () => {
  it("plays a decoder codec and not one the list lacks", () => {
    const caps = complete([h264], ["aac", "opus"]);
    expect(devicePlayability({ audio: { codec: "aac" } }, caps).audio).toBe(true);
    expect(devicePlayability({ audio: { codec: "AAC" } }, caps).audio).toBe(true);
    expect(devicePlayability({ audio: { codec: "ac3" } }, caps).audio).toBe(false);
  });

  it.each([
    ["ac3", "ac3"],
    ["eac3", "eac3"],
    ["eac3", "eac3-joc"],
    ["dts", "dts"],
    ["dts", "dts-hd"],
    ["truehd", "truehd"],
  ] as const)("plays %s through passthrough %s", (codec, format) => {
    expect(devicePlayability({ audio: { codec } }, complete([h264], ["aac"], [format])).audio).toBe(true);
  });

  it.each([
    ["ac3", "eac3"],
    ["eac3", "ac3"],
    ["dts", "ac3"],
    ["dts", "truehd"],
    ["truehd", "dts-hd"],
    ["aac", "ac3"],
  ] as const)("does not play %s through passthrough %s", (codec, format) => {
    expect(devicePlayability({ audio: { codec } }, complete([h264], ["opus"], [format])).audio).toBe(false);
  });

  it("refuses an audio codec outside the vocabulary and a stream without a codec", () => {
    expect(devicePlayability({ audio: { codec: "wmapro" } }, complete([h264], ["aac"])).audio).toBe(false);
    expect(devicePlayability({ audio: {} }, complete([h264], ["aac"])).audio).toBe(false);
  });
});

describe("T2-07 item 1: devicePlayability missing streams", () => {
  const caps = complete([h264], ["aac"]);

  it("judges a source with video and no audio on its video alone", () => {
    expect(playable({ video: { codec: "h264" } }, caps)).toBe(true);
    expect(playable({ video: { codec: "hevc" } }, caps)).toBe(false);
  });

  it("judges a source with audio and no video on its audio alone", () => {
    expect(playable({ audio: { codec: "aac" } }, caps)).toBe(true);
    expect(playable({ audio: { codec: "ac3" } }, caps)).toBe(false);
  });

  it("plays nothing with neither stream", () => {
    expect(playable({}, caps)).toBe(false);
  });
});

describe("T2-07 item 1: devicePlayability against the fake engine's capabilities", () => {
  const caps = fakeCapabilities();
  // The recorded streams: h264 High 8-bit 640x360, hevc Main 10 10-bit 1280x720, av1 Main 10-bit 640x360.
  it("plays the recorded h264, hevc and av1 samples with aac", () => {
    expect(playable({ video: { codec: "h264", profile: "High", bitDepth: 8, width: 640, height: 360 }, audio: { codec: "aac" } }, caps)).toBe(true);
    expect(playable({ video: { codec: "hevc", profile: "Main 10", bitDepth: 10, width: 1280, height: 720 }, audio: { codec: "aac" } }, caps)).toBe(true);
    expect(playable({ video: { codec: "av1", profile: "Main", bitDepth: 10, width: 640, height: 360 }, audio: { codec: "aac" } }, caps)).toBe(true);
  });

  it("plays the recorded ac3 track, which the fake engine decodes and passes through", () => {
    expect(devicePlayability({ audio: { codec: "ac3" } }, caps).audio).toBe(true);
  });

  it("refuses a vp9 source the fake engine has no decoder for", () => {
    expect(devicePlayability({ video: { codec: "vp9" } }, caps).video).toBe(false);
  });
});
