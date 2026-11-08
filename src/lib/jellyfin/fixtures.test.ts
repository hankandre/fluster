import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import { PlaybackRefusedError } from "../../domain/playback";
import { FLUSTER_PROFILE } from "./device-profile";
import { JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpTransport, PlaybackInfoResponse } from "./types";

// Replays PlaybackInfo responses recorded from Jellyfin 10.11.7 and 12.4.0 servers
// (tests/integration/record-fixtures.mjs) through the current gateway.
// Tests named "current gap" document behavior that later tasks change; they
// should be rewritten then.
const fixtureFiles = import.meta.glob("../../../tests/fixtures/jellyfin/*/playbackinfo-*.json", {
  eager: true,
  import: "default",
}) as Record<string, PlaybackInfoResponse>;

function fixture(version: string, name: string): PlaybackInfoResponse {
  const entry = Object.entries(fixtureFiles).find(([path]) => path.endsWith(`/${version}/playbackinfo-${name}.json`));
  if (!entry) throw new Error(`missing fixture ${version}/${name}`);
  return structuredClone(entry[1]);
}

interface PostRecord {
  url: string;
  data: Record<string, unknown>;
  params: Record<string, unknown>;
}

class FixtureTransport implements HttpTransport {
  posts: PostRecord[] = [];

  constructor(private readonly playbackInfo: PlaybackInfoResponse) {}

  async get<T>(): Promise<{ data: T }> {
    throw new Error("unexpected GET");
  }

  async post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<{ data: T }> {
    if (url === "/Users/AuthenticateByName") {
      return { data: { AccessToken: "test-token", User: { Id: "user-test", Name: "tester" } } as T };
    }
    this.posts.push({ url, data: data as Record<string, unknown>, params: config?.params ?? {} });
    return { data: this.playbackInfo as T };
  }

  async delete<T>(): Promise<{ data: T }> {
    throw new Error("unexpected DELETE");
  }
}

async function planFrom(response: PlaybackInfoResponse, itemId: string) {
  const transport = new FixtureTransport(response);
  const gateway = new JellyfinGateway("http://127.0.0.1:8096", transport, "install-1");
  await gateway.login("tester", "password");
  const item: LibraryItem = { id: itemId, name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
  return { transport, run: (mediaSourceId?: string) => gateway.createPlaybackPlan(item, 0, undefined, mediaSourceId) };
}

function plan(version: string, name: string, itemId: string) {
  return planFrom(fixture(version, name), itemId);
}

async function refusalOf(promise: Promise<unknown>): Promise<PlaybackRefusedError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(PlaybackRefusedError);
  return error as PlaybackRefusedError;
}

const FALSE_FLAGS = {
  EnableDirectPlay: true,
  EnableDirectStream: false,
  EnableTranscoding: false,
  AllowVideoStreamCopy: false,
  AllowAudioStreamCopy: false,
  AutoOpenLiveStream: false,
};

const versions = ["10.11.7", "12.4.0"];

describe.each(versions)("PlaybackInfo fixtures from Jellyfin %s", (version) => {
  it("plays the H.264 movie recorded without a DeviceProfile", async () => {
    const { run } = await plan(version, "h264-no-profile", "item-h264");
    const result = await run();
    expect(result.mediaSourceId).toBe("item-h264");
    expect(result.playSessionId).toBe("play-session-1");
    expect(result.tracks.every((track) => !track.external)).toBe(true);
  });

  it("sends the Fluster profile in the body and the false flags in body and query", async () => {
    const { transport, run } = await plan(version, "h264-profile", "item-h264");
    await run();
    const [request] = transport.posts;
    expect(request.url).toBe("/Items/item-h264/PlaybackInfo");
    expect(request.data).toEqual({
      ...FALSE_FLAGS,
      UserId: "user-test",
      StartTimeTicks: 0,
      MaxStreamingBitrate: 1000000000,
      DeviceProfile: FLUSTER_PROFILE,
    });
    expect(request.params).toEqual({ ...FALSE_FLAGS, UserId: "user-test", StartTimeTicks: 0 });
  });

  // The empty-codec assumption: a profile whose DirectPlayProfiles name no
  // container or codec still lets the server report direct play.
  it("plays the H.264 movie recorded with the Fluster profile", async () => {
    const response = fixture(version, "h264-profile");
    expect(response.MediaSources?.[0].SupportsDirectPlay).toBe(true);
    const { run } = await planFrom(response, "item-h264");
    expect((await run()).mediaSourceId).toBe("item-h264");
  });

  it("builds a token-free stream URL and carries the token only in the authorization header", async () => {
    const { run } = await plan(version, "h264-profile", "item-h264");
    const result = await run();
    const url = new URL(result.streamUrl);
    expect(url.pathname).toBe("/Videos/item-h264/stream");
    expect(url.searchParams.get("Static")).toBe("true");
    expect(result.streamUrl).not.toMatch(/api_?key|token/i);
    expect(result.authorization).toMatch(/^MediaBrowser /);
    expect(result.authorization).toContain('Token="test-token"');
  });

  it("maps the external subtitle and its DeliveryUrl", async () => {
    const { run } = await plan(version, "external-subtitle", "item-sidecar");
    const subtitle = (await run()).tracks.find((track) => track.external);
    expect(subtitle).toMatchObject({ index: 0, type: "Subtitle", external: true });
    expect(subtitle?.deliveryUrl).toContain("/Videos/item-sidecar/item-sidecar/Subtitles/0/0/Stream.srt");
  });

  // Jellyfin numbers external streams first, so the sidecar is Index 0 and
  // the embedded video and audio are 1 and 2. The defaults are those indices.
  it("carries the source's default audio and subtitle stream indices", async () => {
    const sidecar = await (await plan(version, "external-subtitle", "item-sidecar")).run();
    expect(sidecar.tracks.map((track) => [track.index, track.type, track.external])).toEqual([
      [0, "Subtitle", true],
      [1, "Video", false],
      [2, "Audio", false],
    ]);
    expect(sidecar.defaultAudioStreamIndex).toBe(2);
    expect(sidecar.defaultSubtitleStreamIndex).toBe(0);

    const multitrack = await (await plan(version, "multitrack-profile", "item-multitrack")).run();
    expect(multitrack.defaultAudioStreamIndex).toBe(1);
    expect(multitrack.defaultSubtitleStreamIndex).toBeUndefined();
  });

  it("strips the server ApiKey from the recorded subtitle DeliveryUrl", async () => {
    const response = fixture(version, "external-subtitle");
    const recorded = response.MediaSources![0].MediaStreams!.find((stream) => stream.IsExternal)!.DeliveryUrl!;
    expect(new URL(recorded, "http://127.0.0.1:8096").searchParams.get("ApiKey")).toBe("REDACTED");
    const { run } = await planFrom(response, "item-sidecar");
    const subtitle = (await run()).tracks.find((track) => track.external);
    const url = new URL(subtitle!.deliveryUrl!);
    expect(url.searchParams.has("ApiKey")).toBe(false);
    expect(url.href).not.toContain("REDACTED");
  });

  it("keeps every token out of the stream and subtitle URLs", async () => {
    const { run } = await plan(version, "external-subtitle", "item-sidecar");
    const result = await run();
    const urls = [result.streamUrl, ...result.tracks.flatMap((track) => track.deliveryUrl ?? [])];
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url).not.toMatch(/api_?key|token|test-token/i);
    }
  });

  it("plays the first version of a multi-version item by default", async () => {
    const { transport, run } = await plan(version, "multi-version", "item-versions");
    expect((await run()).mediaSourceId).toBe("item-versions");
    expect(transport.posts[0].data).not.toHaveProperty("MediaSourceId");
  });

  it("plays the chosen version of a multi-version item by MediaSourceId", async () => {
    const { transport, run } = await plan(version, "multi-version", "item-versions");
    const result = await run("source-versions-2");
    expect(result.mediaSourceId).toBe("source-versions-2");
    expect(new URL(result.streamUrl).searchParams.get("MediaSourceId")).toBe("source-versions-2");
    const [request] = transport.posts;
    expect(request.data).toEqual({
      ...FALSE_FLAGS,
      UserId: "user-test",
      StartTimeTicks: 0,
      MaxStreamingBitrate: 1000000000,
      MediaSourceId: "source-versions-2",
      DeviceProfile: FLUSTER_PROFILE,
    });
    expect(request.params).toEqual({ ...FALSE_FLAGS, UserId: "user-test", StartTimeTicks: 0 });
  });

  it("refuses the recorded BluRay folder with a typed reason", async () => {
    const { run } = await plan(version, "bluray-folder", "item-bluray");
    // The server reports SupportsDirectPlay false here, but the disc check runs first.
    const refusal = await refusalOf(run());
    expect(refusal.reason).toBe("disc-source");
    expect(refusal.detail).toBe("BluRay");
  });

  it("refuses a BluRay source by VideoType even when the server reports direct play", async () => {
    const response = fixture(version, "bluray-folder");
    expect(response.MediaSources?.[0].VideoType).toBe("BluRay");
    response.MediaSources![0].SupportsDirectPlay = true;
    const { run } = await planFrom(response, "item-bluray");
    const refusal = await refusalOf(run());
    expect(refusal.reason).toBe("disc-source");
    expect(refusal.message).not.toContain("/media/");
  });

  // Proves the empty-codec assumption for the sample set: the profile names no
  // container or codec, and the server still offers direct play for each one.
  it.each([
    ["hevc-hdr10-profile", "item-hevc", "hevc"],
    ["av1-profile", "item-av1", "av1"],
    ["ass-profile", "item-ass", "h264"],
    ["multitrack-profile", "item-multitrack", "h264"],
  ])("direct-plays the %s sample with the empty-codec profile", async (name, itemId, codec) => {
    const response = fixture(version, name);
    const [source] = response.MediaSources!;
    expect(source).toMatchObject({ SupportsDirectPlay: true, Protocol: "File", VideoType: "VideoFile", Container: "mkv" });
    expect(source.TranscodingUrl ?? null).toBeNull();
    expect(source.MediaStreams?.find((stream) => stream.Type === "Video")?.Codec).toBe(codec);
    const { run } = await planFrom(response, itemId);
    expect((await run()).mediaSourceId).toBe(itemId);
  });
});
