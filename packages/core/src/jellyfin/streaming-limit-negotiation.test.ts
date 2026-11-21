import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import { MemoryStreamingLimits, type StreamingLimits } from "../streaming-limits";
import { limitIsOnlyReason } from "./client-limit";
import { OCTAVE_PROFILE, MAX_BITRATE } from "./device-profile";
import { JellyfinGateway } from "./gateway";
import type { PlaybackInfoResponse } from "./types";
import type { SignInRequest, SignInResult, Transport, TransportRequest, TransportResponse } from "../ports/transport";
import { webCrypto } from "../adapters/web-crypto";

const directPlay = (): PlaybackInfoResponse => ({
  PlaySessionId: "play-1",
  MediaSources: [{ Id: "src-1", Protocol: "File", Path: "/m/a.mkv", SupportsDirectPlay: true, Bitrate: 50_000_000 }],
});

const limited = (reasons = "ContainerBitrateExceedsLimit", bitrate = 50_000_000): PlaybackInfoResponse => ({
  PlaySessionId: "play-1",
  MediaSources: [{
    Id: "src-1",
    Protocol: "File",
    Path: "/m/a.mkv",
    SupportsDirectPlay: false,
    Bitrate: bitrate,
    TranscodingSubProtocol: "hls",
    TranscodingUrl: `/videos/item-1/master.m3u8?MediaSourceId=src-1&VideoCodec=h264&AudioCodec=aac&PlaySessionId=play-1&ApiKey=k&TranscodeReasons=${reasons}`,
  }],
});

interface Post {
  data: Record<string, unknown>;
  params: Record<string, string>;
}

class FakePlaybackTransport implements Transport {
  posts: Post[] = [];

  constructor(private readonly answer: (call: number) => PlaybackInfoResponse) {}

  async signIn(_request: SignInRequest): Promise<SignInResult> {
    return { session: "session-1", userId: "user-test", userName: "tester" };
  }

  async endSession(): Promise<void> {}

  async request(request: TransportRequest): Promise<TransportResponse> {
    if (request.method !== "POST") throw new Error(`unexpected ${request.method}`);
    this.posts.push({ data: request.body as Record<string, unknown>, params: Object.fromEntries(request.query ?? []) });
    return { status: 200, body: structuredClone(this.answer(this.posts.length)) };
  }
}

const ITEM: LibraryItem = { id: "item-1", name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };

async function negotiate(
  server: string,
  limits: StreamingLimits,
  answer: (call: number) => PlaybackInfoResponse,
  options?: { ignoreStreamingLimit?: boolean },
) {
  const transport = new FakePlaybackTransport(answer);
  const gateway = new JellyfinGateway(server, webCrypto, transport, "install-1", undefined, new MemoryStreamingLimits(limits));
  await gateway.login("tester", "password");
  const plan = await gateway.createPlaybackPlan(ITEM, 0, undefined, undefined, options);
  return { plan, posts: transport.posts };
}

describe("MaxStreamingBitrate", () => {
  it("defaults to no limit: the existing large value in body, query, and profile", async () => {
    const { posts } = await negotiate("https://media.example.com", {}, directPlay);
    expect(posts[0].data.MaxStreamingBitrate).toBe(MAX_BITRATE);
    expect(posts[0].params.MaxStreamingBitrate).toBe(String(MAX_BITRATE));
    expect(posts[0].data.DeviceProfile).toEqual(OCTAVE_PROFILE);
  });

  it.each([
    ["http://127.0.0.1:8096", "loopback"],
    ["https://192.168.1.5:8920", "private-lan"],
    ["https://media.local", "private-lan"],
  ])("sends the local limit to %s (%s) in body, query, and profile", async (server) => {
    const { posts } = await negotiate(server, { localMbps: 20, remoteMbps: 4 }, directPlay);
    expect(posts[0].data.MaxStreamingBitrate).toBe(20_000_000);
    expect(posts[0].params.MaxStreamingBitrate).toBe(String(20_000_000));
    expect((posts[0].data.DeviceProfile as { MaxStreamingBitrate: number }).MaxStreamingBitrate).toBe(20_000_000);
  });

  it("sends the remote limit to a public host in body and query", async () => {
    const { posts } = await negotiate("https://media.example.com", { localMbps: 20, remoteMbps: 4 }, directPlay);
    expect(posts[0].data.MaxStreamingBitrate).toBe(4_000_000);
    expect(posts[0].params.MaxStreamingBitrate).toBe(String(4_000_000));
  });

  it("does not apply the remote limit to a local server, or the local limit to a public one", async () => {
    const local = await negotiate("https://192.168.1.5:8920", { remoteMbps: 4 }, directPlay);
    expect(local.posts[0].params.MaxStreamingBitrate).toBe(String(MAX_BITRATE));
    const remote = await negotiate("https://media.example.com", { localMbps: 4 }, directPlay);
    expect(remote.posts[0].params.MaxStreamingBitrate).toBe(String(MAX_BITRATE));
  });

  it("keeps the limit on every request of a negotiation", async () => {
    const disc = (call: number): PlaybackInfoResponse => call === 1
      ? { PlaySessionId: "p", MediaSources: [{ Id: "src-1", Protocol: "File", Path: "/m/BDMV", VideoType: "BluRay", SupportsDirectPlay: true }] }
      : limited();
    const { posts } = await negotiate("https://media.example.com", { remoteMbps: 8 }, disc);
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.data.MaxStreamingBitrate).toBe(8_000_000);
      expect(post.params.MaxStreamingBitrate).toBe(String(8_000_000));
    }
  });

  it("stays DirectPlay with a limit set when the server offers direct play", async () => {
    const { plan } = await negotiate("https://media.example.com", { remoteMbps: 2 }, directPlay);
    expect(plan).toMatchObject({ delivery: "static", playMethod: "DirectPlay" });
  });

  it("sends no limit when the caller skips the user's limit", async () => {
    const { posts } = await negotiate("https://media.example.com", { remoteMbps: 4 }, directPlay, { ignoreStreamingLimit: true });
    expect(posts[0].data.MaxStreamingBitrate).toBe(MAX_BITRATE);
    expect(posts[0].params.MaxStreamingBitrate).toBe(String(MAX_BITRATE));
  });
});

describe("Play original availability", () => {
  const remote = "https://media.example.com";

  it("is offered when only a bitrate reason applies and the file is over the limit", async () => {
    const { plan } = await negotiate(remote, { remoteMbps: 20 }, () => limited());
    expect(plan.playOriginalAvailable).toBe(true);
  });

  it("is not offered with no limit", async () => {
    const { plan } = await negotiate(remote, {}, () => limited());
    expect(plan.playOriginalAvailable).toBe(false);
  });

  it("is not offered when another reason also applies", async () => {
    const { plan } = await negotiate(remote, { remoteMbps: 20 }, () => limited("AudioCodecNotSupported,ContainerBitrateExceedsLimit"));
    expect(plan.playOriginalAvailable).toBe(false);
  });

  it("is not offered when the file is under the limit, which means the server's own policy converts it", async () => {
    const { plan } = await negotiate(remote, { remoteMbps: 20 }, () => limited("ContainerBitrateExceedsLimit", 10_000_000));
    expect(plan.playOriginalAvailable).toBe(false);
  });

  it("is not offered for direct play", async () => {
    const { plan } = await negotiate(remote, { remoteMbps: 20 }, directPlay);
    expect(plan.playOriginalAvailable).toBe(false);
  });

  it("is not offered once the limit was skipped, even if the server still converts", async () => {
    const { plan } = await negotiate(remote, { remoteMbps: 20 }, () => limited(), { ignoreStreamingLimit: true });
    expect(plan.playOriginalAvailable).toBe(false);
  });
});

describe("limitIsOnlyReason", () => {
  const source = { Bitrate: 50_000_000 };

  it("accepts each bitrate reason alone", () => {
    for (const reason of ["ContainerBitrateExceedsLimit", "VideoBitrateNotSupported", "AudioBitrateNotSupported"] as const) {
      expect(limitIsOnlyReason(source, [reason], 20_000_000)).toBe(true);
    }
    expect(limitIsOnlyReason(source, ["ContainerBitrateExceedsLimit", "VideoBitrateNotSupported"], 20_000_000)).toBe(true);
  });

  it("refuses no reasons, a mixed reason, an unknown bitrate, or a file at the limit", () => {
    expect(limitIsOnlyReason(source, [], 20_000_000)).toBe(false);
    expect(limitIsOnlyReason(source, ["ContainerNotSupported"], 20_000_000)).toBe(false);
    expect(limitIsOnlyReason({}, ["ContainerBitrateExceedsLimit"], 20_000_000)).toBe(false);
    expect(limitIsOnlyReason(source, ["ContainerBitrateExceedsLimit"], 50_000_000)).toBe(false);
    expect(limitIsOnlyReason(source, ["ContainerBitrateExceedsLimit"], MAX_BITRATE)).toBe(false);
  });
});
