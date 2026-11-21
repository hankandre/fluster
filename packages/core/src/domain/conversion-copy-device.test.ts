import { describe, expect, it } from "vitest";
import { CLIENT_CONVERSION_REASON_COPY, conversionIndicator } from "./conversion-copy";
import { CLIENT_CONVERSION_REASONS, PlaybackRefusedError, type PlaybackPlan } from "./playback";

// T2-07 items 3 and 5: the copy the owner confirmed on 2026-11-21 (docs/specs/decisions-T2-07.md), compared exactly.
const base = {
  itemId: "i",
  title: "t",
  streamUrl: "https://media.test/videos/i/master.m3u8",
  authorization: "x",
  mediaSourceId: "s",
  playSessionId: "p",
  startPositionTicks: 0,
  tracks: [],
};

function hls(playMethod: "DirectStream" | "Transcode", reasons: PlaybackPlan["conversionReasons"], client = true): PlaybackPlan {
  return {
    ...base,
    delivery: "hls",
    playMethod,
    conversionReasons: reasons,
    serverUrl: "https://media.test",
    mediaKind: "videos",
    subtitlesBurnedIn: false,
    ...(client ? { clientConversionReason: "DeviceCannotPlay" } : {}),
  } as PlaybackPlan;
}

const CLIENT_COPY = "this device cannot play the original";

describe("T2-07 item 5: the client reason and its copy", () => {
  it("has one client reason, with copy", () => {
    expect([...CLIENT_CONVERSION_REASONS]).toEqual(["DeviceCannotPlay"]);
    expect(CLIENT_CONVERSION_REASON_COPY.DeviceCannotPlay).toBe(CLIENT_COPY);
  });

  it("words the chip as the owner confirmed", () => {
    expect(conversionIndicator(hls("Transcode", ["DirectPlayError"]))?.chip).toBe("Converting on server: this device cannot play the original");
  });

  it("leads the chip with the client reason, before a bitrate reason", () => {
    expect(conversionIndicator(hls("Transcode", ["ContainerBitrateExceedsLimit", "DirectPlayError"]))?.chip).toBe("Converting on server: this device cannot play the original");
  });

  it("always uses the Converting chip for a client reason, even when the confirmed method is DirectStream", () => {
    expect(conversionIndicator(hls("DirectStream", ["ContainerNotSupported"]))?.chip).toBe("Converting on server: this device cannot play the original");
    expect(conversionIndicator(hls("DirectStream", []))?.chip).toBe("Converting on server: this device cannot play the original");
  });

  it("lists the client reason first in the information panel and drops DirectPlayError", () => {
    const indicator = conversionIndicator(hls("Transcode", ["AudioCodecNotSupported", "DirectPlayError"]));
    expect(indicator?.reasons).toEqual([CLIENT_COPY, "the audio format is not supported here"]);
    expect(indicator?.reasons.join(" ")).not.toContain("playing the original file failed");
  });

  it("shows only the client reason when the server sent only DirectPlayError", () => {
    expect(conversionIndicator(hls("Transcode", ["DirectPlayError"]))?.reasons).toEqual([CLIENT_COPY]);
  });

  it("leaves a plan without a client reason as it was, DirectPlayError included", () => {
    const indicator = conversionIndicator(hls("Transcode", ["DirectPlayError"], false));
    expect(indicator?.chip).toBe("Converting on server: playing the original file failed");
    expect(indicator?.reasons).toEqual(["playing the original file failed"]);
  });
});

describe("T2-07 item 3: the refusal copy", () => {
  it("says this device cannot play the file and the server offered no conversion", () => {
    const error = new PlaybackRefusedError({ reason: "device-cannot-play" });
    expect(error.message).toBe("This device cannot play the file, and the server offered no conversion.");
    expect(error.reason).toBe("device-cannot-play");
  });
});
