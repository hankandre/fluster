import { describe, expect, it } from "vitest";
import { CONVERSION_REASONS, type PlaybackPlan } from "../../domain/playback";
import { CONVERSION_REASON_COPY, NO_REASON_COPY, conversionIndicator } from "./conversion-copy";

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

function hls(playMethod: "DirectStream" | "Transcode", reasons: PlaybackPlan["conversionReasons"], burned = false): PlaybackPlan {
  return {
    ...base,
    delivery: "hls",
    playMethod,
    conversionReasons: reasons,
    serverUrl: "https://media.test",
    mediaKind: "videos",
    subtitlesBurnedIn: burned,
  } as PlaybackPlan;
}

describe("conversion copy", () => {
  it("has plain copy for every reason, with no jargon", () => {
    for (const reason of CONVERSION_REASONS) {
      const copy = CONVERSION_REASON_COPY[reason];
      expect(copy.length, reason).toBeGreaterThan(10);
      expect(copy, reason).not.toMatch(/transcod|remux|Supported$/);
    }
  });

  it("shows nothing for direct play", () => {
    expect(conversionIndicator({ ...base, delivery: "static", playMethod: "DirectPlay", conversionReasons: [] })).toBeUndefined();
    expect(conversionIndicator(undefined)).toBeUndefined();
  });

  it("words a transcode and a direct stream as the acceptance rules say", () => {
    expect(conversionIndicator(hls("Transcode", ["VideoCodecNotSupported"]))?.chip)
      .toBe("Converting on server: the video format is not supported here");
    expect(conversionIndicator(hls("DirectStream", ["ContainerNotSupported"]))?.chip)
      .toBe("Repackaging on server, original quality: the file format is not supported here");
  });

  it("leads with the streaming limit and lists every reason", () => {
    const indicator = conversionIndicator(hls("Transcode", ["AudioCodecNotSupported", "ContainerBitrateExceedsLimit"]));
    expect(indicator?.chip).toBe("Converting on server: the file is over your streaming limit");
    expect(indicator?.reasons).toHaveLength(2);
  });

  it("falls back when the server gave no reason", () => {
    const indicator = conversionIndicator(hls("Transcode", []));
    expect(indicator?.chip).toBe(`Converting on server: ${NO_REASON_COPY}`);
    expect(indicator?.reasons).toEqual([NO_REASON_COPY]);
  });

  it("says when subtitles are burned in", () => {
    expect(conversionIndicator(hls("Transcode", [], true))?.subtitlesBurnedIn).toBe(true);
    expect(conversionIndicator(hls("Transcode", []))?.subtitlesBurnedIn).toBe(false);
  });
});
