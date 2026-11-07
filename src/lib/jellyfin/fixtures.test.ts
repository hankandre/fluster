import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import { JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpTransport, PlaybackInfoResponse } from "./types";

// Replays PlaybackInfo responses recorded from real Jellyfin servers
// (tests/integration/record-fixtures.mjs) through the current gateway.
// Assertions describe today's behavior. Tests named "current gap" document
// behavior that later tasks change; they should be rewritten then.
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
}

async function plan(version: string, name: string, itemId: string) {
  const transport = new FixtureTransport(fixture(version, name));
  const gateway = new JellyfinGateway("http://127.0.0.1:8096", transport, "install-1");
  await gateway.login("tester", "password");
  const item: LibraryItem = { id: itemId, name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
  return { transport, run: () => gateway.createPlaybackPlan(item) };
}

const versions = ["10.11.7", "12.4.0"];

describe.each(versions)("PlaybackInfo fixtures from Jellyfin %s", (version) => {
  it("plays the H.264 movie recorded without a DeviceProfile", async () => {
    const { transport, run } = await plan(version, "h264-no-profile", "item-h264");
    const result = await run();
    expect(result.mediaSourceId).toBe("item-h264");
    expect(result.playSessionId).toBe("play-session-1");
    expect(result.tracks.every((track) => !track.external)).toBe(true);
    const [request] = transport.posts;
    expect(request.url).toBe("/Items/item-h264/PlaybackInfo");
    expect(request.data).toMatchObject({
      UserId: "user-test",
      EnableDirectPlay: true,
      EnableDirectStream: false,
      EnableTranscoding: false,
      AllowVideoStreamCopy: false,
      AllowAudioStreamCopy: false,
      AutoOpenLiveStream: false,
    });
    expect(request.params).toMatchObject({ EnableDirectPlay: true, EnableTranscoding: false });
  });

  it("current gap, fixed by P1-03: the request carries no DeviceProfile", async () => {
    const { transport, run } = await plan(version, "h264-profile", "item-h264");
    await run();
    expect(transport.posts[0].data).not.toHaveProperty("DeviceProfile");
  });

  it("plays the H.264 movie recorded with the Fluster profile", async () => {
    const { run } = await plan(version, "h264-profile", "item-h264");
    expect((await run()).mediaSourceId).toBe("item-h264");
  });

  it("current gap, fixed by P1-04: the stream URL carries the token as api_key", async () => {
    const { run } = await plan(version, "h264-profile", "item-h264");
    const url = new URL((await run()).streamUrl);
    expect(url.pathname).toBe("/Videos/item-h264/stream");
    expect(url.searchParams.get("Static")).toBe("true");
    expect(url.searchParams.get("api_key")).toBe("test-token");
  });

  it("maps the external subtitle and its DeliveryUrl", async () => {
    const { run } = await plan(version, "external-subtitle", "item-sidecar");
    const subtitle = (await run()).tracks.find((track) => track.external);
    expect(subtitle).toMatchObject({ index: 0, type: "Subtitle", external: true });
    expect(subtitle?.deliveryUrl).toContain("/Videos/item-sidecar/item-sidecar/Subtitles/0/0/Stream.srt");
  });

  it("current gap, fixed by P1-04: the subtitle URL keeps the server ApiKey and adds api_key", async () => {
    const { run } = await plan(version, "external-subtitle", "item-sidecar");
    const subtitle = (await run()).tracks.find((track) => track.external);
    const url = new URL(subtitle!.deliveryUrl!);
    expect(url.searchParams.get("ApiKey")).toBe("REDACTED");
    expect(url.searchParams.get("api_key")).toBe("test-token");
  });

  it("current gap, fixed by P1-03: multi-version items always play the first source", async () => {
    const { run } = await plan(version, "multi-version", "item-versions");
    expect((await run()).mediaSourceId).toBe("item-versions");
  });

  it("refuses the BluRay folder today only because the server says SupportsDirectPlay is false", async () => {
    const { run } = await plan(version, "bluray-folder", "item-bluray");
    await expect(run()).rejects.toThrow("No static, file-backed direct-play source");
  });

  // The server itself blocks the disc folder in the recorded response. If a
  // server or policy ever reported SupportsDirectPlay true, the gateway would
  // accept it because it never checks VideoType. P1-03 must make this pass.
  it.fails("rejects a BluRay source by VideoType even when the server reports direct play", async () => {
    const response = fixture(version, "bluray-folder");
    expect((response.MediaSources?.[0] as { VideoType?: string }).VideoType).toBe("BluRay");
    response.MediaSources![0].SupportsDirectPlay = true;
    const transport = new FixtureTransport(response);
    const gateway = new JellyfinGateway("http://127.0.0.1:8096", transport, "install-1");
    await gateway.login("tester", "password");
    const item: LibraryItem = { id: "item-bluray", name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
    await expect(gateway.createPlaybackPlan(item)).rejects.toThrow();
  });
});
