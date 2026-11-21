import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackPlanOptions } from "../domain/playback";
import { JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpTransport, MediaSourceDto, PlaybackInfoResponse } from "./types";

// P17-08: a viewer's audio pick on a first negotiation, replayed with the recorded fixtures from
// Jellyfin 10.11.7 and 12.4.0 (ARCHITECTURE.md §3, "A viewer's audio pick").
const fixtureFiles = import.meta.glob("../../tests/fixtures/jellyfin/*/conversion-*.json", {
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

// Answers PlaybackInfo requests in order; the last answer repeats. A `failAt` answer rejects.
class QueueTransport implements HttpTransport {
  posts: PostRecord[] = [];

  constructor(private readonly answers: PlaybackInfoResponse[], private readonly failAt?: number) {}

  async get<T>(): Promise<{ data: T }> {
    throw new Error("unexpected GET");
  }

  async post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<{ data: T }> {
    if (url === "/Users/AuthenticateByName") {
      return { data: { AccessToken: "test-token", User: { Id: "user-test", Name: "tester" } } as T };
    }
    this.posts.push({ url, data: data as Record<string, unknown>, params: config?.params ?? {} });
    if (this.failAt === this.posts.length - 1) throw new Error("boom http://127.0.0.1:8096/x?ApiKey=secret");
    const answer = this.answers[Math.min(this.posts.length - 1, this.answers.length - 1)];
    return { data: structuredClone(answer) as T };
  }

  async delete<T>(): Promise<{ data: T }> {
    throw new Error("unexpected DELETE");
  }
}

const SERVER = "http://127.0.0.1:8096";

async function negotiate(itemId: string, answers: PlaybackInfoResponse[], mediaSourceId: string | undefined, options: PlaybackPlanOptions, failAt?: number) {
  const transport = new QueueTransport(answers, failAt);
  const gateway = new JellyfinGateway(SERVER, transport, "install-1");
  await gateway.login("tester", "password");
  const item: LibraryItem = { id: itemId, name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
  const result = await gateway.createPlaybackPlan(item, 0, undefined, mediaSourceId, options).catch((error: unknown) => error);
  return { transport, result };
}

function planOf(result: unknown): PlaybackPlan {
  if (result instanceof Error) throw result;
  return result as PlaybackPlan;
}

const PICK: PlaybackPlanOptions = { audioStreamIndex: 2, keepDirectPlay: true };

describe.each(["10.11.7", "12.4.0"])("audio pick negotiation with the fixtures from Jellyfin %s", (version) => {
  it("no pick: one request, and no AudioStreamIndex or keepDirectPlay in body or query", async () => {
    const { transport, result } = await negotiate("item-multitrack", [fixture(version, "multitrack")], undefined, { ignoreStreamingLimit: false });
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(1);
    const [request] = transport.posts;
    for (const part of [request.data, request.params]) {
      expect(part).not.toHaveProperty("AudioStreamIndex");
      expect(part).not.toHaveProperty("keepDirectPlay");
      expect(part).not.toHaveProperty("KeepDirectPlay");
    }
    expect(plan.defaultAudioStreamIndex).toBe(1);
  });

  it("a pick in direct play: one request with the index and the source in body and query", async () => {
    const { transport, result } = await negotiate("item-multitrack", [fixture(version, "multitrack-audio-pick")], "item-multitrack", PICK);
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(1);
    const [request] = transport.posts;
    expect(request.data).toMatchObject({ AudioStreamIndex: 2, MediaSourceId: "item-multitrack" });
    expect(request.params).toMatchObject({ AudioStreamIndex: 2 });
    expect(request.data).not.toHaveProperty("keepDirectPlay");
    expect(request.params).not.toHaveProperty("keepDirectPlay");
    expect(plan).toMatchObject({ delivery: "static", playMethod: "DirectPlay", mediaSourceId: "item-multitrack", defaultAudioStreamIndex: 2 });
    expect(new URL(plan.streamUrl).searchParams.get("Static")).toBe("true");
  });

  it("a pick in a conversion: a second request without the index, and the first answer is used", async () => {
    const { transport, result } = await negotiate(
      "item-multitrack",
      [fixture(version, "multitrack-audio-pick-force-fallback"), fixture(version, "multitrack-force-fallback")],
      "item-multitrack",
      PICK,
    );
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    const [first, second] = transport.posts;
    expect(first.data).toMatchObject({ AudioStreamIndex: 2 });
    expect(second.data).not.toHaveProperty("AudioStreamIndex");
    expect(second.params).not.toHaveProperty("AudioStreamIndex");
    expect(second.data).toMatchObject({ EnableDirectPlay: true, MediaSourceId: "item-multitrack" });
    expect(plan.delivery).toBe("hls");
    expect(new URL(plan.streamUrl).searchParams.get("AudioStreamIndex")).toBe("2");
    expect(plan.defaultAudioStreamIndex).toBe(2);
  });

  it("the index would convert a source that direct plays: the plain answer is used", async () => {
    const { transport, result } = await negotiate(
      "item-multitrack",
      [fixture(version, "multitrack-audio-pick-force-fallback"), fixture(version, "multitrack")],
      "item-multitrack",
      PICK,
    );
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    expect(plan).toMatchObject({ delivery: "static", playMethod: "DirectPlay", defaultAudioStreamIndex: 2 });
    expect(plan.streamUrl).not.toMatch(/master\.m3u8/);
  });

  it("an unmappable pick (no such stream): the plain answer plays the server's default", async () => {
    const { transport, result } = await negotiate(
      "item-multitrack",
      [fixture(version, "multitrack-audio-pick-missing"), fixture(version, "multitrack")],
      "item-multitrack",
      { audioStreamIndex: 9, keepDirectPlay: true },
    );
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    expect(plan).toMatchObject({ delivery: "static", defaultAudioStreamIndex: 1 });
  });

  it("an unmappable pick (external audio file): the plain answer plays the server's default", async () => {
    const external = (answer: PlaybackInfoResponse) => {
      const source = answer.MediaSources?.[0] as MediaSourceDto;
      const stream = source.MediaStreams?.find((s) => s.Index === 2);
      if (stream) stream.IsExternal = true;
      return answer;
    };
    const { transport, result } = await negotiate(
      "item-multitrack",
      [external(fixture(version, "multitrack-audio-pick")), external(fixture(version, "multitrack"))],
      "item-multitrack",
      PICK,
    );
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    expect(plan).toMatchObject({ delivery: "static", defaultAudioStreamIndex: 1 });
  });

  it("an external pick the server direct plays: a plain answer that converts never replaces it", async () => {
    const external = (answer: PlaybackInfoResponse) => {
      const source = answer.MediaSources?.[0] as MediaSourceDto;
      const stream = source.MediaStreams?.find((s) => s.Index === 2);
      if (stream) stream.IsExternal = true;
      return answer;
    };
    const first = external(fixture(version, "multitrack-audio-pick"));
    const { transport, result } = await negotiate(
      "item-multitrack",
      [first, fixture(version, "multitrack-force-fallback")],
      "item-multitrack",
      PICK,
    );
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(2);
    expect(plan).toMatchObject({ delivery: "static", playMethod: "DirectPlay" });
    expect(plan.playSessionId).toBe(first.PlaySessionId);
  });

  it("a pick on a second version names that version", async () => {
    const { transport, result } = await negotiate(
      "item-versions",
      [fixture(version, "versions")],
      "source-versions-2",
      { audioStreamIndex: 1, keepDirectPlay: true },
    );
    const plan = planOf(result);
    expect(transport.posts).toHaveLength(1);
    expect(transport.posts[0].data).toMatchObject({ MediaSourceId: "source-versions-2", AudioStreamIndex: 1 });
    expect(plan).toMatchObject({ mediaSourceId: "source-versions-2", defaultAudioStreamIndex: 1 });
  });

  it("a disc with a pick: the two requests of the forced fallback, both with the index", async () => {
    const { transport, result } = await negotiate(
      "item-iso",
      [fixture(version, "iso"), fixture(version, "iso-force-fallback")],
      "item-iso",
      { audioStreamIndex: 1, keepDirectPlay: true },
    );
    planOf(result);
    expect(transport.posts).toHaveLength(2);
    expect(transport.posts[0].data).toMatchObject({ AudioStreamIndex: 1, EnableDirectPlay: true });
    expect(transport.posts[1].data).toMatchObject({ AudioStreamIndex: 1, EnableDirectPlay: false });
  });

  it("an index without keepDirectPlay on a converting source: exactly one request", async () => {
    const { transport, result } = await negotiate(
      "item-multitrack",
      [fixture(version, "multitrack-audio-pick-force-fallback")],
      "item-multitrack",
      { audioStreamIndex: 2 },
    );
    expect(planOf(result).delivery).toBe("hls");
    expect(transport.posts).toHaveLength(1);
  });

  it("a failed guard request fails the attempt with a redacted error", async () => {
    const { result } = await negotiate(
      "item-multitrack",
      [fixture(version, "multitrack-audio-pick-force-fallback"), fixture(version, "multitrack")],
      "item-multitrack",
      PICK,
      1,
    );
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).not.toContain("secret");
  });
});
