import { describe, expect, it } from "vitest";
import { OCTAVE_PROFILE } from "./device-profile";
import { FAILED, negotiate, recorded, VERSIONS, withoutH264 } from "./device-test-support";

// T2-07 item 6: what the device can decode never reaches the server. The forced request sends the DeviceProfile the
// first request sent, which is OCTAVE_PROFILE with the request's MaxStreamingBitrate, and no codec or container condition.
const CODECS = ["h264", "hevc", "av1", "vp9", "vp8", "mpeg2video", "mpeg4", "vc1", "aac", "mp3", "ac3", "eac3", "truehd", "dts", "flac", "alac", "opus", "vorbis"];

// Every key and every comma- or space-separated word of every value, so a source id such as item-h264 is not a codec.
function words(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(words);
  if (typeof value === "object") return Object.entries(value).flatMap(([key, inner]) => [key, ...words(inner)]);
  return String(value).split(/[,\s]+/);
}

describe.each(VERSIONS)("T2-07 item 6: the DeviceProfile on the forced request to Jellyfin %s", (version) => {
  it.each([
    ["a list without h264", withoutH264],
    ["a failed probe", FAILED],
  ] as const)("is the first request's profile, unchanged, under %s", async (_name, caps) => {
    const { transport } = await negotiate("item-h264", [recorded(version, "conversion-h264"), recorded(version, "device-conversion-h264")], caps);
    expect(transport.posts).toHaveLength(2);
    const [first, forced] = transport.posts;
    const profile = forced.data.DeviceProfile as typeof OCTAVE_PROFILE & { MaxStreamingBitrate: number };
    expect(profile).toEqual(first.data.DeviceProfile);
    expect(profile).toEqual({ ...OCTAVE_PROFILE, MaxStreamingBitrate: forced.data.MaxStreamingBitrate });
    expect(profile.CodecProfiles).toEqual([]);
    expect(profile.ContainerProfiles).toEqual([]);
  });

  it("names no codec in the request body outside the profile, nor in the query", async () => {
    const { transport } = await negotiate("item-h264", [recorded(version, "conversion-h264"), recorded(version, "device-conversion-h264")], withoutH264);
    const forced = transport.posts[1];
    const { DeviceProfile: _profile, ...rest } = forced.data;
    for (const word of [...words(rest), ...words(forced.query.map(([name, value]) => [name, value]))]) {
      expect(CODECS, word).not.toContain(word.toLowerCase());
    }
  });

  it("puts no codec or container condition in the profile's direct-play entries", async () => {
    const { transport } = await negotiate("item-h264", [recorded(version, "conversion-h264"), recorded(version, "device-conversion-h264")], withoutH264);
    const profile = transport.posts[1].data.DeviceProfile as { DirectPlayProfiles: Record<string, unknown>[] };
    for (const entry of profile.DirectPlayProfiles) {
      expect(Object.keys(entry).sort()).toEqual(["Type"]);
    }
  });
});
