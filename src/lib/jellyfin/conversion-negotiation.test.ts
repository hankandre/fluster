import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import { PlaybackRefusedError, type PlaybackPlan } from "../../domain/playback";
import { FLUSTER_PROFILE } from "./device-profile";
import { JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpTransport, PlaybackInfoResponse } from "./types";

// Replays the P10-02 conversion fixtures (recorded on Jellyfin 10.11.7 and
// 12.4.0 with the decision 0002 profile and flags) through the gateway's
// negotiation: the source decision, the forced fallback, and the HLS URL
// rebuild (ARCHITECTURE.md §3).
const fixtureFiles = import.meta.glob("../../../tests/fixtures/jellyfin/*/conversion-*.json", {
  eager: true,
  import: "default",
}) as Record<string, PlaybackInfoResponse>;

function fixture(version: string, name: string): PlaybackInfoResponse {
  const entry = Object.entries(fixtureFiles).find(([path]) => path.endsWith(`/${version}/conversion-${name}.json`));
  if (!entry) throw new Error(`missing fixture ${version}/${name}`);
  return structuredClone(entry[1]);
}

interface PostRecord {
  url: string;
  data: Record<string, unknown>;
  params: Record<string, unknown>;
}

// Answers PlaybackInfo requests in order; the last answer repeats.
class QueueTransport implements HttpTransport {
  posts: PostRecord[] = [];

  constructor(private readonly answers: PlaybackInfoResponse[]) {}

  async get<T>(): Promise<{ data: T }> {
    throw new Error("unexpected GET");
  }

  async post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<{ data: T }> {
    if (url === "/Users/AuthenticateByName") {
      return { data: { AccessToken: "test-token", User: { Id: "user-test", Name: "tester" } } as T };
    }
    this.posts.push({ url, data: data as Record<string, unknown>, params: config?.params ?? {} });
    const answer = this.answers[Math.min(this.posts.length - 1, this.answers.length - 1)];
    return { data: structuredClone(answer) as T };
  }

  async delete<T>(): Promise<{ data: T }> {
    throw new Error("unexpected DELETE");
  }
}

const SERVER = "http://127.0.0.1:8096";

async function negotiate(itemId: string, answers: PlaybackInfoResponse[], mediaSourceId?: string) {
  const transport = new QueueTransport(answers);
  const gateway = new JellyfinGateway(SERVER, transport, "install-1");
  await gateway.login("tester", "password");
  const item: LibraryItem = { id: itemId, name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
  const result = await gateway.createPlaybackPlan(item, 0, undefined, mediaSourceId).catch((error: unknown) => error);
  return { transport, result };
}

function planOf(result: unknown): PlaybackPlan {
  if (result instanceof Error) throw result;
  return result as PlaybackPlan;
}

function refusalOf(result: unknown): PlaybackRefusedError {
  expect(result).toBeInstanceOf(PlaybackRefusedError);
  return result as PlaybackRefusedError;
}

const FLAGS = {
  EnableDirectPlay: true,
  EnableDirectStream: true,
  EnableTranscoding: true,
  AllowVideoStreamCopy: true,
  AllowAudioStreamCopy: true,
  AutoOpenLiveStream: false,
};

// Every file sample the servers offer for direct play with no limit
// (P10-02), with the item id the recorder scrubbed it to.
const DIRECT_PLAY_SAMPLES: [string, string][] = [
  ["h264", "item-h264"],
  ["hevc-hdr10", "item-hevc"],
  ["av1", "item-av1"],
  ["ass", "item-ass"],
  ["sidecar", "item-sidecar"],
  ["multitrack", "item-multitrack"],
  ["versions", "item-versions"],
  ["dvdsub", "item-dvdsub"],
  ["episode-s01e01", "item-episode-1"],
  ["episode-s01e02", "item-episode-2"],
  ["episode-s00e01", "item-episode-0"],
  ["h264-no-conversion-user", "item-h264"],
];

function expectHlsMaster(plan: PlaybackPlan, itemId: string) {
  const url = new URL(plan.streamUrl);
  expect(url.origin).toBe(SERVER);
  expect(url.pathname).toBe(`/videos/${itemId}/master.m3u8`);
  expect(url.searchParams.getAll("EnableTrickplay")).toEqual(["false"]);
  expect(url.searchParams.get("MediaSourceId")).toBe(plan.mediaSourceId);
  expect(url.searchParams.get("PlaySessionId")).toBe(plan.playSessionId);
  expect(plan.streamUrl).not.toMatch(/api_?key|token|REDACTED/i);
}

describe.each(["10.11.7", "12.4.0"])("negotiation with the conversion fixtures from Jellyfin %s", (version) => {
  it.each(DIRECT_PLAY_SAMPLES)("still direct plays the %s sample with one request", async (name, itemId) => {
    const { transport, result } = await negotiate(itemId, [fixture(version, name)]);
    const plan = planOf(result);
    expect(plan).toMatchObject({ delivery: "static", playMethod: "DirectPlay", conversionReasons: [] });
    expect(new URL(plan.streamUrl).pathname).toBe(`/Videos/${itemId}/stream`);
    expect(new URL(plan.streamUrl).searchParams.get("Static")).toBe("true");
    expect(transport.posts).toHaveLength(1);
  });

  it("sends the decision 0002 flags in body and query", async () => {
    const { transport } = await negotiate("item-h264", [fixture(version, "h264")]);
    const [request] = transport.posts;
    expect(request.data).toEqual({
      ...FLAGS,
      AlwaysBurnInSubtitleWhenTranscoding: false,
      UserId: "user-test",
      StartTimeTicks: 0,
      MaxStreamingBitrate: 1000000000,
      DeviceProfile: FLUSTER_PROFILE,
    });
    expect(request.params).toEqual({ ...FLAGS, UserId: "user-test", StartTimeTicks: 0, MaxStreamingBitrate: 1000000000 });
  });

  // The server offers direct play for the ISO (P10-02), so rule 4 applies.
  it("re-requests the ISO once with EnableDirectPlay false and plays the conversion", async () => {
    const { transport, result } = await negotiate("item-iso", [fixture(version, "iso"), fixture(version, "iso-force-fallback")]);
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    const [first, second] = transport.posts;
    expect(first.data).toMatchObject({ EnableDirectPlay: true });
    expect(first.data).not.toHaveProperty("MediaSourceId");
    expect(second.data).toMatchObject({ ...FLAGS, EnableDirectPlay: false, MediaSourceId: "item-iso", DeviceProfile: FLUSTER_PROFILE });
    expect(second.params).toEqual({ ...FLAGS, EnableDirectPlay: false, UserId: "user-test", StartTimeTicks: 0, MaxStreamingBitrate: 1000000000 });
    // The URL's AudioCodec lists the profile's codecs, not the source's ac3,
    // so the audio may be re-encoded: Transcode.
    expect(plan).toMatchObject({ delivery: "hls", playMethod: "Transcode", mediaSourceId: "item-iso" });
    expect(plan.conversionReasons).toContain("DirectPlayError");
    expectHlsMaster(plan, "item-iso");
  });

  it("refuses the ISO as iso-source when the re-request still offers direct play, without a third request", async () => {
    const { transport, result } = await negotiate("item-iso", [fixture(version, "iso")]);
    expect(refusalOf(result).reason).toBe("iso-source");
    expect(transport.posts).toHaveLength(2);
  });

  // No TranscodeReasons and no probed streams: nothing shows a copy.
  it("converts the BluRay folder as Transcode with no forced-fallback request", async () => {
    const { transport, result } = await negotiate("item-bluray", [fixture(version, "bluray-folder")]);
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(1);
    expect(plan).toMatchObject({ delivery: "hls", playMethod: "Transcode", conversionReasons: [] });
    expectHlsMaster(plan, "item-bluray");
  });

  it("transcodes the H.264 sample under a streaming limit with the bitrate reason", async () => {
    const { result } = await negotiate("item-h264", [fixture(version, "h264-limited")]);
    const plan = planOf(result);
    expect(plan).toMatchObject({ delivery: "hls", playMethod: "Transcode" });
    expect(plan.conversionReasons).toContain("ContainerBitrateExceedsLimit");
    expectHlsMaster(plan, "item-h264");
  });

  it.each([
    ["h264-force-fallback", "item-h264"],
    ["hevc-hdr10-force-fallback", "item-hevc"],
    ["av1-force-fallback", "item-av1"],
    ["ass-force-fallback", "item-ass"],
    ["sidecar-force-fallback", "item-sidecar"],
    ["multitrack-force-fallback", "item-multitrack"],
    ["dvdsub-force-fallback", "item-dvdsub"],
    ["bluray-folder-force-fallback", "item-bluray"],
  ])("labels the %s answer Transcode, because no reason is container-only", async (name, itemId) => {
    const plan = planOf((await negotiate(itemId, [fixture(version, name)])).result);
    expect(plan).toMatchObject({ delivery: "hls", playMethod: "Transcode" });
    expectHlsMaster(plan, itemId);
  });

  it("keeps the burned-in DVD subtitle method in the rebuilt URL", async () => {
    const plan = planOf((await negotiate("item-dvdsub", [fixture(version, "dvdsub-force-fallback")])).result);
    expect(new URL(plan.streamUrl).searchParams.get("SubtitleMethod")).toBe("Encode");
    expect(plan.subtitlesBurnedIn).toBe(true);
  });

  it("does not flag burned-in subtitles for a conversion that delivers them as files", async () => {
    const plan = planOf((await negotiate("item-sidecar", [fixture(version, "sidecar-force-fallback")])).result);
    expect(plan.subtitlesBurnedIn).toBe(false);
  });

  it("strips the key from external subtitle URLs while converting", async () => {
    const plan = planOf((await negotiate("item-sidecar", [fixture(version, "sidecar-force-fallback")])).result);
    const subtitle = plan.tracks.find((track) => track.external);
    expect(subtitle?.deliveryUrl).toBeDefined();
    expect(subtitle?.deliveryUrl).not.toMatch(/api_?key|REDACTED/i);
  });

  it.each([
    ["bluray-folder-no-conversion-user", "item-bluray"],
    ["h264-limited-no-conversion-user", "item-h264"],
  ])("refuses the %s answer as conversion-not-allowed", async (name, itemId) => {
    const { transport, result } = await negotiate(itemId, [fixture(version, name)]);
    expect(refusalOf(result).reason).toBe("conversion-not-allowed");
    expect(transport.posts).toHaveLength(1);
  });

  it("refuses a recorded conversion whose URL names another play session than the answer", async () => {
    const answer = fixture(version, "h264-limited");
    answer.PlaySessionId = "play-session-2";
    expect(refusalOf((await negotiate("item-h264", [answer])).result)).toMatchObject({ reason: "unsafe-transcoding-url", detail: "play session" });
  });

  it("refuses a recorded conversion whose URL names another server", async () => {
    const answer = fixture(version, "h264-limited");
    answer.MediaSources![0].TranscodingUrl = `https://evil.test${answer.MediaSources![0].TranscodingUrl}`;
    const error = refusalOf((await negotiate("item-h264", [answer])).result);
    expect(error.reason).toBe("unsafe-transcoding-url");
    expect(`${error.message} ${error.detail}`).not.toMatch(/evil\.test|REDACTED|ApiKey/);
  });
});
