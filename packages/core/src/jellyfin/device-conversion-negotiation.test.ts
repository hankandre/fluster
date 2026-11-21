import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PlaybackRefusedError, type PlaybackPlan } from "../domain/playback";
import { MemoryStreamingLimits } from "../streaming-limits";
import {
  EVERYTHING,
  FAILED,
  listOf,
  negotiate,
  queryValue,
  recorded,
  VERSIONS,
  withoutAc3,
  withoutH264,
  withoutHevc,
  withSession,
  type Post,
} from "./device-test-support";
import type { PlaybackInfoResponse } from "./types";

// T2-07 items 2, 3, 5, 7 and 8: the forced-conversion request and its answer (spec "The rules"), replayed from the
// recordings of Jellyfin 10.11.7 and 12.4.0 and from the pinned Jellyscale.
const FORCED = "play-session-forced";
const OMITTED = ["EnableDirectPlay", "AllowVideoStreamCopy", "AllowAudioStreamCopy", "MediaSourceId"];

function planOf(result: unknown): PlaybackPlan {
  if (result instanceof Error) throw result;
  return result as PlaybackPlan;
}

function refusalOf(result: unknown): PlaybackRefusedError {
  expect(result).toBeInstanceOf(PlaybackRefusedError);
  return result as PlaybackRefusedError;
}

function without(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !OMITTED.includes(key)));
}

function pairs(post: Post): Record<string, string> {
  return Object.fromEntries(post.query);
}

// The forced request: both flags false in body and in the query pairs, the audio flag as asked, the source named,
// and everything else (flags, indices, limit, profile) exactly as on the first request.
function expectForced(first: Post, forced: Post, expected: { audioCopy: boolean; mediaSourceId: string }) {
  expect(forced.data).toMatchObject({
    EnableDirectPlay: false,
    AllowVideoStreamCopy: false,
    AllowAudioStreamCopy: expected.audioCopy,
    EnableDirectStream: true,
    EnableTranscoding: true,
    AutoOpenLiveStream: false,
    MediaSourceId: expected.mediaSourceId,
  });
  expect(queryValue(forced, "EnableDirectPlay")).toBe("false");
  expect(queryValue(forced, "AllowVideoStreamCopy")).toBe("false");
  expect(queryValue(forced, "AllowAudioStreamCopy")).toBe(String(expected.audioCopy));
  expect(forced.query.filter(([name]) => name === "EnableDirectPlay")).toHaveLength(1);
  expect(without(forced.data)).toEqual(without(first.data));
  expect(without(pairs(forced))).toEqual(without(pairs(first)));
  expect(forced.data.DeviceProfile).toEqual(first.data.DeviceProfile);
}

function expectFirst(first: Post) {
  expect(first.data).toMatchObject({ EnableDirectPlay: true, AllowVideoStreamCopy: true, AllowAudioStreamCopy: true });
  expect(queryValue(first, "EnableDirectPlay")).toBe("true");
}

describe.each(VERSIONS)("T2-07 item 2: the forced request to Jellyfin %s", (version) => {
  it("sends exactly one more PlaybackInfo naming the source, and uses its answer", async () => {
    const forcedAnswer = withSession(recorded(version, "device-conversion-h264"), FORCED);
    const { transport, result } = await negotiate("item-h264", [recorded(version, "conversion-h264"), forcedAnswer], withoutH264);
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    const [first, forced] = transport.posts;
    expectFirst(first);
    expect(first.data).not.toHaveProperty("MediaSourceId");
    expectForced(first, forced, { audioCopy: true, mediaSourceId: "item-h264" });
    expect(plan).toMatchObject({ delivery: "hls", playMethod: "Transcode", mediaSourceId: "item-h264", playSessionId: FORCED });
    const url = new URL(plan.streamUrl);
    expect(url.pathname).toBe("/videos/item-h264/master.m3u8");
    expect(url.searchParams.get("PlaySessionId")).toBe(FORCED);
    expect(plan.streamUrl).not.toMatch(/api_?key|token|REDACTED/i);
  });

  it("asks again for the hevc sample on a list without hevc", async () => {
    const { transport, result } = await negotiate("item-hevc", [recorded(version, "conversion-hevc-hdr10"), withSession(recorded(version, "device-conversion-hevc-hdr10"), FORCED)], withoutHevc);
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    expectForced(transport.posts[0], transport.posts[1], { audioCopy: true, mediaSourceId: "item-hevc" });
    expect(plan).toMatchObject({ delivery: "hls", mediaSourceId: "item-hevc", playSessionId: FORCED });
  });

  it("turns audio stream copy off too when the judged audio is what the device cannot play", async () => {
    const forcedAnswer = withSession(recorded(version, "device-conversion-multitrack-audio"), FORCED);
    const { transport, result } = await negotiate("item-multitrack", [recorded(version, "conversion-multitrack"), forcedAnswer], listOf(["h264", "hevc", "av1"], ["ac3"]));
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    expectForced(transport.posts[0], transport.posts[1], { audioCopy: false, mediaSourceId: "item-multitrack" });
    expect(plan).toMatchObject({ delivery: "hls", playSessionId: FORCED });
  });

  it("converts when the probe failed", async () => {
    const { transport, result } = await negotiate("item-h264", [recorded(version, "conversion-h264"), recorded(version, "device-conversion-h264")], FAILED);
    expect(planOf(result)).toMatchObject({ delivery: "hls" });
    expect(transport.posts).toHaveLength(2);
    expect(transport.posts[1].data).toMatchObject({ EnableDirectPlay: false, AllowVideoStreamCopy: false, AllowAudioStreamCopy: false });
  });

  it("keeps the requested version and the stream indices of a renegotiation", async () => {
    const { transport, result } = await negotiate("item-h264", [recorded(version, "conversion-h264"), recorded(version, "device-conversion-h264")], withoutH264, {
      mediaSourceId: "item-h264",
      options: { audioStreamIndex: 1, subtitleStreamIndex: -1 },
    });
    expect(planOf(result).delivery).toBe("hls");
    const [first, forced] = transport.posts;
    expect(first.data).toMatchObject({ MediaSourceId: "item-h264", AudioStreamIndex: 1, SubtitleStreamIndex: -1 });
    expect(forced.data).toMatchObject({ MediaSourceId: "item-h264", AudioStreamIndex: 1, SubtitleStreamIndex: -1 });
    expect(queryValue(forced, "AudioStreamIndex")).toBe("1");
    expect(queryValue(forced, "SubtitleStreamIndex")).toBe("-1");
    expectForced(first, forced, { audioCopy: true, mediaSourceId: "item-h264" });
  });

  it("keeps the streaming limit on the forced request, in body, query and profile", async () => {
    const limits = new MemoryStreamingLimits({ localMbps: 20 });
    const { transport } = await negotiate("item-h264", [recorded(version, "conversion-h264"), recorded(version, "device-conversion-h264")], withoutH264, { limits });
    const [first, forced] = transport.posts;
    for (const post of [first, forced]) {
      expect(post.data.MaxStreamingBitrate).toBe(20_000_000);
      expect(queryValue(post, "MaxStreamingBitrate")).toBe("20000000");
      expect((post.data.DeviceProfile as { MaxStreamingBitrate: number }).MaxStreamingBitrate).toBe(20_000_000);
    }
  });

  it("sends a disc's forced fallback with EnableDirectPlay false only, under a failed probe", async () => {
    const { transport } = await negotiate("item-iso", [recorded(version, "conversion-iso"), recorded(version, "conversion-iso-force-fallback")], FAILED);
    expect(transport.posts).toHaveLength(2);
    expect(transport.posts[1].data).toMatchObject({ EnableDirectPlay: false, AllowVideoStreamCopy: true, AllowAudioStreamCopy: true });
    expect(queryValue(transport.posts[1], "AllowVideoStreamCopy")).toBe("true");
  });
});

describe.each(VERSIONS)("T2-07 item 2: a viewer's audio pick on Jellyfin %s", (version) => {
  const pick = { audioStreamIndex: 2, keepDirectPlay: true };
  const request = { mediaSourceId: "item-multitrack", options: pick };

  it("skips the plain request when the video cannot play, and the forced request carries the pick", async () => {
    const answers = [recorded(version, "conversion-multitrack-audio-pick"), withSession(recorded(version, "device-conversion-multitrack-audio"), FORCED)];
    const { transport, result } = await negotiate("item-multitrack", answers, withoutH264, request);
    expect(transport.posts).toHaveLength(2);
    const [first, forced] = transport.posts;
    expect(first.data).toMatchObject({ AudioStreamIndex: 2, EnableDirectPlay: true });
    expect(forced.data).toMatchObject({ AudioStreamIndex: 2, EnableDirectPlay: false, AllowVideoStreamCopy: false, AllowAudioStreamCopy: true });
    expect(queryValue(forced, "AudioStreamIndex")).toBe("2");
    expectForced(first, forced, { audioCopy: true, mediaSourceId: "item-multitrack" });
    expect(planOf(result)).toMatchObject({ delivery: "hls", playSessionId: FORCED, defaultAudioStreamIndex: 2 });
  });

  it("direct plays the original with the default audio when only the picked audio cannot play and the plain answer plays", async () => {
    const answers = [recorded(version, "conversion-multitrack-audio-pick"), recorded(version, "conversion-multitrack")];
    const { transport, result } = await negotiate("item-multitrack", answers, withoutAc3, request);
    expect(transport.posts).toHaveLength(2);
    expect(transport.posts[0].data).toMatchObject({ AudioStreamIndex: 2, EnableDirectPlay: true });
    expect(transport.posts[1].data).not.toHaveProperty("AudioStreamIndex");
    expect(transport.posts[1].data).toMatchObject({ EnableDirectPlay: true, AllowVideoStreamCopy: true });
    expect(planOf(result)).toMatchObject({ delivery: "static", playMethod: "DirectPlay", defaultAudioStreamIndex: 1 });
  });

  it("sends the forced request with the pick after the plain request when neither audio can play, three requests in all", async () => {
    const answers = [
      recorded(version, "conversion-multitrack-audio-pick"),
      recorded(version, "conversion-multitrack"),
      withSession(recorded(version, "device-conversion-multitrack-audio"), FORCED),
    ];
    const { transport, result } = await negotiate("item-multitrack", answers, listOf(["h264"], ["opus"]), request);
    expect(transport.posts).toHaveLength(3);
    const [first, plain, forced] = transport.posts;
    expect(plain.data).not.toHaveProperty("AudioStreamIndex");
    expect(forced.data).toMatchObject({ AudioStreamIndex: 2 });
    expectForced(first, forced, { audioCopy: false, mediaSourceId: "item-multitrack" });
    expect(planOf(result)).toMatchObject({ delivery: "hls", playSessionId: FORCED });
  });

  it("ends in one forced request after a refused first answer and a plain answer that needs the conversion", async () => {
    const refused = recorded(version, "conversion-multitrack-audio-pick");
    refused.MediaSources![0].SupportsDirectPlay = false;
    refused.MediaSources![0].SupportsTranscoding = false;
    const answers = [refused, recorded(version, "conversion-multitrack"), withSession(recorded(version, "device-conversion-multitrack-audio"), FORCED)];
    const { transport, result } = await negotiate("item-multitrack", answers, withoutH264, request);
    expect(transport.posts).toHaveLength(3);
    expect(transport.posts[2].data).toMatchObject({ EnableDirectPlay: false, AllowVideoStreamCopy: false, MediaSourceId: "item-multitrack" });
    expect(planOf(result)).toMatchObject({ delivery: "hls", playSessionId: FORCED });
  });
});

describe.each(VERSIONS)("T2-07 item 3: the refusal after the forced request to Jellyfin %s", (version) => {
  const first = () => recorded(version, "conversion-h264");

  it("refuses with device-cannot-play when the server offers direct play again, without a third request", async () => {
    const { transport, result } = await negotiate("item-h264", [first()], withoutH264);
    const error = refusalOf(result);
    expect(error.reason).toBe("device-cannot-play");
    expect(error.detail).toBe("direct play offered again");
    expect(error.message).toContain("This device cannot play the file");
    expect(transport.posts).toHaveLength(2);
  });

  it("refuses an answer whose URL does not show stream copy is off (the recorded forced fallback copies)", async () => {
    const { transport, result } = await negotiate("item-h264", [first(), recorded(version, "conversion-h264-force-fallback")], withoutH264);
    expect(refusalOf(result)).toMatchObject({ reason: "device-cannot-play", detail: "stream copy not turned off" });
    expect(transport.posts).toHaveLength(2);
  });

  it("refuses an answer that turns video copy off but not the audio copy the request turned off", async () => {
    const { result } = await negotiate("item-h264", [first(), recorded(version, "device-conversion-h264")], FAILED);
    expect(refusalOf(result)).toMatchObject({ reason: "device-cannot-play", detail: "stream copy not turned off" });
  });

  it("matches the copy parameters in any case", async () => {
    const answer = recorded(version, "device-conversion-h264");
    const source = answer.MediaSources![0];
    source.TranscodingUrl = source.TranscodingUrl!.replace(/allowVideoStreamCopy=false/i, "ALLOWVIDEOSTREAMCOPY=False");
    const { result } = await negotiate("item-h264", [first(), answer], withoutH264);
    expect(planOf(result).delivery).toBe("hls");
  });

  it("refuses with device-cannot-play when nothing is offered and the server may convert", async () => {
    const answer = recorded(version, "conversion-h264-limited-no-conversion-user");
    answer.MediaSources![0].SupportsTranscoding = true;
    const { transport, result } = await negotiate("item-h264", [first(), answer], withoutH264);
    expect(refusalOf(result)).toMatchObject({ reason: "device-cannot-play", detail: "no conversion offered" });
    expect(transport.posts).toHaveLength(2);
  });

  it("keeps conversion-not-allowed for the recorded account that may not convert", async () => {
    const { transport, result } = await negotiate("item-h264", [first(), recorded(version, "conversion-h264-limited-no-conversion-user")], withoutH264);
    expect(refusalOf(result).reason).toBe("conversion-not-allowed");
    expect(transport.posts).toHaveLength(2);
  });

  it("refuses with device-cannot-play when direct play is offered again to an account that may not convert", async () => {
    const { transport, result } = await negotiate("item-h264", [first(), recorded(version, "conversion-h264-no-conversion-user")], withoutH264);
    expect(refusalOf(result).reason).toBe("device-cannot-play");
    expect(transport.posts).toHaveLength(2);
  });

  it("gives the answer's own refusal for a TranscodingUrl that is not HLS", async () => {
    const answer = recorded(version, "device-conversion-h264");
    answer.MediaSources![0].TranscodingSubProtocol = "http";
    expect(refusalOf((await negotiate("item-h264", [first(), answer], withoutH264)).result).reason).toBe("unsafe-transcoding-url");
  });

  it("gives the answer's own refusal for a TranscodingUrl on another server", async () => {
    const answer = recorded(version, "device-conversion-h264");
    answer.MediaSources![0].TranscodingUrl = `https://evil.test${answer.MediaSources![0].TranscodingUrl}`;
    const error = refusalOf((await negotiate("item-h264", [first(), answer], withoutH264)).result);
    expect(error.reason).toBe("unsafe-transcoding-url");
    expect(`${error.message} ${error.detail}`).not.toMatch(/evil\.test|REDACTED|ApiKey/);
  });

  it("gives the answer's own refusal for a live source", async () => {
    const answer = recorded(version, "device-conversion-h264");
    answer.MediaSources![0].RequiresOpening = true;
    expect(refusalOf((await negotiate("item-h264", [first(), answer], withoutH264)).result).reason).toBe("live-source");
  });

  it("never puts a play session, address or token in the refusal", async () => {
    const error = refusalOf((await negotiate("item-h264", [first()], withoutH264)).result);
    expect(`${error.message} ${error.detail}`).not.toMatch(/play-session|127\.0\.0\.1|REDACTED|ApiKey/);
  });
});

describe("T2-07 item 5: the plan carries the client-side conversion reason", () => {
  it.each(VERSIONS)("names DeviceCannotPlay on a plan built from the Jellyfin %s forced answer", async (version) => {
    const { result } = await negotiate("item-h264", [recorded(version, "conversion-h264"), recorded(version, "device-conversion-h264")], withoutH264);
    const plan = planOf(result);
    expect(plan.delivery).toBe("hls");
    expect(plan).toMatchObject({ clientConversionReason: "DeviceCannotPlay", playOriginalAvailable: false });
    // What the server sent stays as it was sent.
    expect(plan.conversionReasons).toContain("DirectPlayError");
  });

  it.each(VERSIONS)("names no client reason on a direct play, a bitrate conversion or a disc fallback (Jellyfin %s)", async (version) => {
    const direct = planOf((await negotiate("item-h264", [recorded(version, "conversion-h264")], EVERYTHING)).result);
    const limited = planOf((await negotiate("item-h264", [recorded(version, "conversion-h264-limited")], withoutH264)).result);
    const disc = planOf((await negotiate("item-iso", [recorded(version, "conversion-iso"), recorded(version, "conversion-iso-force-fallback")], withoutH264)).result);
    for (const plan of [direct, limited, disc]) expect(plan).not.toHaveProperty("clientConversionReason");
  });
});

describe.each(VERSIONS)("T2-07 item 7: the recorded device conversions from Jellyfin %s replay as Transcode plans", (version) => {
  it.each([
    ["device-conversion-h264", "conversion-h264", "item-h264", withoutH264],
    ["device-conversion-hevc-hdr10", "conversion-hevc-hdr10", "item-hevc", withoutHevc],
    ["device-conversion-multitrack-audio", "conversion-multitrack", "item-multitrack", listOf(["h264", "hevc", "av1"], ["ac3"])],
  ] as const)("%s", async (name, firstName, itemId, caps) => {
    const { transport, result } = await negotiate(itemId, [recorded(version, firstName), recorded(version, name)], caps);
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    expect(plan).toMatchObject({ delivery: "hls", playMethod: "Transcode", mediaSourceId: itemId, clientConversionReason: "DeviceCannotPlay" });
    expect(new URL(plan.streamUrl).pathname).toBe(`/videos/${itemId}/master.m3u8`);
    expect(plan.conversionReasons).toContain("DirectPlayError");
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const composePath = join(here, "../../../../tests/integration/docker-compose.yml");
const pinFolder = (): string => {
  const sha = /^x-jellyscale-commit:\s*([0-9a-f]{40})\b/m.exec(readFileSync(composePath, "utf8"))?.[1];
  if (!sha) throw new Error("docker-compose.yml has no x-jellyscale-commit of 40 hex characters");
  return sha.slice(0, 12);
};
const jellyscale = (file: string): PlaybackInfoResponse => JSON.parse(readFileSync(join(here, "../../tests/fixtures/jellyscale", pinFolder(), `${file}.json`), "utf8")) as PlaybackInfoResponse;

describe("T2-07 item 8: the pinned Jellyscale today", () => {
  it("answers the forced request with direct play again and no conversion", () => {
    const source = jellyscale("device-conversion-h264").MediaSources![0];
    expect(source.SupportsDirectPlay).toBe(true);
    expect(source.TranscodingUrl).toBeUndefined();
  });

  it.each([
    ["a list without h264", withoutH264],
    ["a failed probe", FAILED],
  ] as const)("refuses the file with device-cannot-play on %s, after exactly two requests", async (_name, caps) => {
    const { transport, result } = await negotiate("item-h264", [jellyscale("playbackinfo-h264-profile"), jellyscale("device-conversion-h264")], caps);
    expect(refusalOf(result)).toMatchObject({ reason: "device-cannot-play" });
    expect(refusalOf(result).message).toContain("This device cannot play the file");
    expect(transport.posts).toHaveLength(2);
    expect(transport.posts[1].data).toMatchObject({ EnableDirectPlay: false, AllowVideoStreamCopy: false });
  });
});
