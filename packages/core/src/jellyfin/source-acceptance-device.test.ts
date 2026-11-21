import { describe, expect, it } from "vitest";
import type { PlayerCapabilities } from "../domain/player-engine";
import { EVERYTHING, FAILED, listOf, recorded, VERSIONS, withoutAc3, withoutH264 } from "./device-test-support";
import { decideSource, selectSource, type SourceContext } from "./source-acceptance";
import type { MediaSourceDto } from "./types";

// T2-07 item 1: the source decision takes the device's capabilities (spec "Source decision").
const ITEM = "item-h264";

function context(capabilities: PlayerCapabilities | "full", extra: Partial<SourceContext> = {}): SourceContext {
  return { serverUrl: "http://127.0.0.1:8096", itemId: ITEM, playSessionId: "play-session-1", capabilities, ...extra } as SourceContext;
}

const sourceOf = (version: string, name: string, index = 0): MediaSourceDto => recorded(version, name).MediaSources![index];

describe.each(VERSIONS)("T2-07 item 1: the decision on the Jellyfin %s first answers", (version) => {
  it.each([
    ["conversion-h264", withoutH264, { video: true, audio: false }],
    ["conversion-hevc-hdr10", listOf(["h264", "av1"], ["aac"]), { video: true, audio: false }],
    ["conversion-av1", listOf(["h264", "hevc"], ["aac"]), { video: true, audio: false }],
  ] as const)("returns force-conversion for %s when the video decoder is missing", (name, caps) => {
    const decision = decideSource(sourceOf(version, name), context(caps));
    expect(decision).toMatchObject({ kind: "force-conversion", cannotPlay: { video: true } });
    expect(decision.kind === "force-conversion" && decision.cannotPlay.audio).toBe(false);
  });

  it("returns force-conversion with the audio part when only the judged audio cannot play", () => {
    const decision = decideSource(sourceOf(version, "conversion-h264"), context(listOf(["h264"], ["ac3"])));
    expect(decision).toMatchObject({ kind: "force-conversion", cannotPlay: { video: false, audio: true } });
  });

  it("returns force-conversion with both parts when neither can play", () => {
    const decision = decideSource(sourceOf(version, "conversion-h264"), context(listOf(["av1"], ["ac3"])));
    expect(decision).toMatchObject({ kind: "force-conversion", cannotPlay: { video: true, audio: true } });
  });

  it.each([["conversion-h264"], ["conversion-hevc-hdr10"], ["conversion-av1"], ["conversion-multitrack"]])(
    "direct plays %s when the device can play it",
    (name) => {
      expect(decideSource(sourceOf(version, name), context(EVERYTHING)).kind).toBe("direct-play");
      expect(decideSource(sourceOf(version, name), context("full")).kind).toBe("direct-play");
    },
  );

  it("treats a failed probe as nothing playable", () => {
    expect(decideSource(sourceOf(version, "conversion-h264"), context(FAILED))).toMatchObject({
      kind: "force-conversion",
      cannotPlay: { video: true, audio: true },
    });
  });

  it("judges the audio the request names, else the default track", () => {
    const multitrack = sourceOf(version, "conversion-multitrack");
    // Index 1 is aac (the default), index 2 is ac3.
    expect(decideSource(multitrack, context(withoutAc3)).kind).toBe("direct-play");
    expect(decideSource(multitrack, context(withoutAc3, { audioStreamIndex: 2 }))).toMatchObject({
      kind: "force-conversion",
      cannotPlay: { video: false, audio: true },
    });
    expect(decideSource(multitrack, context(withoutAc3, { audioStreamIndex: 1 })).kind).toBe("direct-play");
  });

  it("converts a source with no streams to judge when the list is complete, and plays it under full", () => {
    const bare: MediaSourceDto = { ...sourceOf(version, "conversion-h264"), MediaStreams: [] };
    expect(decideSource(bare, context(EVERYTHING)).kind).toBe("force-conversion");
    expect(decideSource(bare, context("full")).kind).toBe("direct-play");
  });

  it("does not take a source with a missing profile for one that matches a stated profile", () => {
    const source = sourceOf(version, "conversion-h264");
    const noProfile: MediaSourceDto = { ...source, MediaStreams: source.MediaStreams!.map((stream) => (stream.Type === "Video" ? { ...stream, Profile: undefined } : stream)) };
    const strict: PlayerCapabilities = { probe: "complete", videoDecoders: [{ codec: "h264", hardware: true, profile: "High" }], audioDecoders: ["aac"], hdr: [], passthrough: [] };
    expect(decideSource(source, context(strict)).kind).toBe("direct-play");
    expect(decideSource(noProfile, context(strict)).kind).toBe("force-conversion");
  });

  it("keeps a disc a forced fallback, whatever the probe says", () => {
    for (const caps of [FAILED, withoutH264, EVERYTHING, "full" as const]) {
      expect(decideSource(sourceOf(version, "conversion-iso"), context(caps, { itemId: "item-iso" })).kind).toBe("force-fallback");
    }
  });

  it("keeps a first answer that carries a TranscodingUrl a conversion", () => {
    const decision = decideSource(sourceOf(version, "conversion-h264-limited"), context(FAILED));
    expect(decision.kind).toBe("convert");
  });

  it("keeps rules 1 and 2 ahead of the device rule", () => {
    const source = sourceOf(version, "conversion-h264");
    expect(decideSource({ ...source, Id: undefined }, context(FAILED))).toMatchObject({ kind: "refused", reason: "missing-source-data" });
    expect(decideSource({ ...source, RequiresOpening: true }, context(FAILED))).toMatchObject({ kind: "refused", reason: "live-source" });
  });

  describe("several versions", () => {
    // The 1080p source is first, the 720p source second; the list decodes h264 only up to 1280x720.
    const small = listOf([], ["aac"]);
    const upTo720: PlayerCapabilities = { ...small, videoDecoders: [{ codec: "h264", hardware: true, maxWidth: 1280, maxHeight: 720 }] } as PlayerCapabilities;

    it("prefers a version the device can play, in either order", () => {
      const sources = recorded(version, "conversion-versions").MediaSources!;
      expect(selectSource(sources, context(upTo720, { itemId: "item-versions" }))).toMatchObject({ kind: "direct-play", source: { Id: "source-versions-2" } });
      expect(selectSource([...sources].reverse(), context(upTo720, { itemId: "item-versions" }))).toMatchObject({ kind: "direct-play", source: { Id: "source-versions-2" } });
    });

    it("does not swap a requested version for another", () => {
      const sources = recorded(version, "conversion-versions").MediaSources!;
      const decision = selectSource(sources, context(upTo720, { itemId: "item-versions" }), "item-versions");
      expect(decision).toMatchObject({ kind: "force-conversion", source: { Id: "item-versions" } });
    });

    it("ranks a version that needs the forced conversion above a disc and a refusal, and below a conversion", () => {
      const direct = sourceOf(version, "conversion-h264");
      const disc = { ...sourceOf(version, "conversion-iso"), Id: "disc-source" };
      const refused: MediaSourceDto = { ...direct, Id: "refused-source", SupportsDirectPlay: false };
      expect(selectSource([refused, disc, direct], context(FAILED))).toMatchObject({ kind: "force-conversion", source: { Id: "item-h264" } });
      expect(selectSource([refused, disc], context(FAILED))).toMatchObject({ kind: "force-fallback", source: { Id: "disc-source" } });
      const converted = sourceOf(version, "conversion-h264-limited");
      expect(selectSource([direct, { ...converted, Id: "converted-source" }], context(FAILED))).toMatchObject({ kind: "convert" });
    });
  });
});
