import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import { PlaybackRefusedError, type PlaybackPlan, type PlaybackSnapshot } from "../../domain/playback";
import { FLUSTER_PROFILE } from "./device-profile";
import {
  buildStaticStreamUrl,
  CONTROL_REQUEST_TIMEOUT_MS,
  PLAYBACK_INFO_FLAGS,
  JellyfinGateway,
  PUBLIC_HTTP_REFUSED_MESSAGE,
  REDIRECT_REFUSED_MESSAGE,
  REPORT_REQUEST_TIMEOUT_MS,
  UNENCRYPTED_NOT_CONFIRMED_MESSAGE,
} from "./gateway";
import type { LanHttpConfirmation, LanHttpConfirmationStore } from "../lan-http-confirmations";
import type { HttpRequestConfig, HttpResponse, HttpTransport } from "./types";

interface RequestRecord {
  method: "GET" | "POST" | "DELETE";
  url: string;
  data?: unknown;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeout?: number;
}

class FakeTransport implements HttpTransport {
  requests: RequestRecord[] = [];
  responses = new Map<string, unknown>();
  // Status codes to resolve with, as Axios does for a WebView opaque redirect.
  statuses = new Map<string, number>();

  async get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.requests.push({
      method: "GET",
      url,
      params: config?.params,
      headers: config?.headers,
      signal: config?.signal,
      timeout: config?.timeout,
    });
    return { data: this.responses.get(`GET ${url}`) as T, status: this.statuses.get(`GET ${url}`) };
  }

  async post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.requests.push({
      method: "POST",
      url,
      data,
      params: config?.params,
      headers: config?.headers,
      signal: config?.signal,
      timeout: config?.timeout,
    });
    return { data: this.responses.get(`POST ${url}`) as T, status: this.statuses.get(`POST ${url}`) };
  }

  async delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.requests.push({
      method: "DELETE",
      url,
      params: config?.params,
      headers: config?.headers,
      signal: config?.signal,
      timeout: config?.timeout,
    });
    return { data: this.responses.get(`DELETE ${url}`) as T, status: this.statuses.get(`DELETE ${url}`) };
  }
}

const item: LibraryItem = {
  id: "item/one",
  name: "Arrival",
  type: "Movie",
  resumePositionTicks: 0,
  played: false,
};

function authenticatedGateway() {
  const transport = new FakeTransport();
  transport.responses.set("POST /Users/AuthenticateByName", {
    AccessToken: "top-secret",
    User: { Id: "user-1", Name: "Louise" },
  });
  const gateway = new JellyfinGateway("https://media.test/jellyfin/", transport, "install-1");
  return gateway.login("Louise", "password").then(() => ({ gateway, transport }));
}

describe("JellyfinGateway direct-play contract", () => {
  it.each([
    ["https://media.test/jellyfin/", "https://media.test/jellyfin", "public"],
    ["http://localhost:8096", "http://localhost:8096", "loopback"],
    ["http://127.0.0.1:8096", "http://127.0.0.1:8096", "loopback"],
    ["http://127.42.7.9:8096", "http://127.42.7.9:8096", "loopback"],
    ["http://[::1]:8096", "http://[::1]:8096", "loopback"],
    ["http://192.168.1.5:8096/jellyfin/", "http://192.168.1.5:8096/jellyfin", "private-lan"],
    ["http://3232235777:8096", "http://192.168.1.1:8096", "private-lan"],
    ["http://NAS.local:8096", "http://nas.local:8096", "private-lan"],
    ["https://192.168.1.5:8920", "https://192.168.1.5:8920", "private-lan"],
  ])("accepts %s as %s (%s)", (input, serverUrl, hostClass) => {
    const gateway = new JellyfinGateway(input, new FakeTransport());
    expect(gateway.serverUrl).toBe(serverUrl);
    expect(gateway.hostClass).toBe(hostClass);
    expect(gateway.origin).toBe(new URL(serverUrl).origin);
  });

  it.each([
    "http://media.test",
    "http://localhost.example.com",
    "http://100.64.0.1:8096",
    "http://[::ffff:8.8.8.8]:8096",
    "http://jellyfin.lan:8096",
    "ftp://localhost/media",
    "https://name:swordfish@media.test",
    "not a URL",
  ])("rejects an unsafe server URL without echoing it: %s", (serverUrl) => {
    let message = "";
    try {
      new JellyfinGateway(serverUrl, new FakeTransport());
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(serverUrl);
    expect(message).not.toContain("swordfish");
  });

  it("maps Jellyfin resume position and played state", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Items", {
      Items: [{
        Id: "movie-1",
        Name: "Arrival",
        Type: "Movie",
        UserData: { PlaybackPositionTicks: 987_000_000, Played: false },
      }],
    });

    await expect(gateway.latest()).resolves.toEqual([expect.objectContaining({
      id: "movie-1",
      resumePositionTicks: 987_000_000,
      played: false,
    })]);
    const request = transport.requests.at(-1);
    expect(request?.url).toBe("/Items");
    expect(request?.params?.userId).toBe("user-1");
    expect(request?.params?.Fields).toBe("Overview");
    expect(request?.params?.EnableUserData).toBe(true);
  });
  it("configures an isolated SDK transport with the Jellyfin base URL and device authorization", async () => {
    const get = vi.fn().mockResolvedValue({ data: { ServerName: "Home", Version: "10.11.11" } });
    const isolatedAxios = {
      defaults: { headers: { common: {} as Record<string, string> } },
      get,
      post: vi.fn(),
    };
    const create = vi.spyOn(axios, "create").mockReturnValue(isolatedAxios as never);
    try {
      const gateway = new JellyfinGateway("https://media.test/jellyfin/");
      await gateway.connect();
      expect(create).toHaveBeenCalledWith({
        baseURL: "https://media.test/jellyfin",
        timeout: CONTROL_REQUEST_TIMEOUT_MS,
        adapter: "fetch",
        maxRedirects: 0,
      });
      expect(isolatedAxios.defaults.headers.common.Authorization).toContain('Client="Fluster"');
      expect(get).toHaveBeenCalledWith("/System/Info/Public", {
        signal: undefined,
        timeout: CONTROL_REQUEST_TIMEOUT_MS,
      });
    } finally {
      create.mockRestore();
    }
  });

  it.each(["10.11.7", "12.4.0"])("accepts Jellyfin %s", async (version) => {
    const transport = new FakeTransport();
    transport.responses.set("GET /System/Info/Public", { ServerName: "Home", Version: version });
    await expect(new JellyfinGateway("https://media.test", transport).connect()).resolves.toEqual({
      name: "Home",
      version,
      hostClass: "public",
      needsUnencryptedConfirmation: false,
    });
  });

  it.each(["10.10.7", "", "abc", "10", "10.x.1", "v12.4.0"])("rejects Jellyfin version %j", async (version) => {
    const transport = new FakeTransport();
    transport.responses.set("GET /System/Info/Public", { Version: version });
    await expect(new JellyfinGateway("https://media.test", transport).connect()).rejects.toThrow(
      `Fluster needs Jellyfin 10.11 or newer; this server reports ${version}.`,
    );
  });

  it("returns the stable user ID and applies control request cancellation", async () => {
    const transport = new FakeTransport();
    transport.responses.set("POST /Users/AuthenticateByName", {
      AccessToken: "top-secret",
      User: { Id: "user-1", Name: "Louise" },
    });
    const signal = new AbortController().signal;
    const gateway = new JellyfinGateway("https://media.test", transport);

    await expect(gateway.login("Louise", "password", signal)).resolves.toEqual({
      userId: "user-1",
      username: "Louise",
    });
    expect(transport.requests.at(-1)).toMatchObject({
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
  });

  // Decision 0002 "Negotiation" table, in the body and the query string.
  it("sends the Fluster profile in the body and the decision 0002 flags in both body and query", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [{ Id: "source-1", Path: "/media/movie.mkv", Protocol: "File", SupportsDirectPlay: true }],
    });
    await gateway.createPlaybackPlan(item, 42);
    const request = transport.requests.at(-1)!;
    expect(request.url).toBe("/Items/item/one/PlaybackInfo");
    expect(request.data).toEqual({
      EnableDirectPlay: true,
      EnableDirectStream: true,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      AutoOpenLiveStream: false,
      AlwaysBurnInSubtitleWhenTranscoding: false,
      UserId: "user-1",
      StartTimeTicks: 42,
      MaxStreamingBitrate: 1000000000,
      DeviceProfile: FLUSTER_PROFILE,
    });
    expect(request.params).toEqual({
      EnableDirectPlay: true,
      EnableDirectStream: true,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      AutoOpenLiveStream: false,
      UserId: "user-1",
      StartTimeTicks: 42,
      MaxStreamingBitrate: 1000000000,
    });
  });

  // P10-08: a track change renegotiates with the chosen streams for the
  // playing version (PlaybackInfoDto and getPostedPlaybackInfo, SDK 1.0.2).
  it("sends the chosen audio and subtitle streams with the version in both body and query", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [{ Id: "source-1", Path: "/media/movie.mkv", Protocol: "File", SupportsDirectPlay: true, Bitrate: 8_000_000 }],
    });
    const plan = await gateway.createPlaybackPlan(item, 420_000_000, undefined, "source-1", {
      audioStreamIndex: 2,
      subtitleStreamIndex: -1,
    });
    const request = transport.requests.at(-1)!;
    expect(request.data).toMatchObject({ MediaSourceId: "source-1", StartTimeTicks: 420_000_000, AudioStreamIndex: 2, SubtitleStreamIndex: -1 });
    expect(request.params).toMatchObject({ StartTimeTicks: 420_000_000, AudioStreamIndex: 2, SubtitleStreamIndex: -1 });
    expect(plan.sourceBitrate).toBe(8_000_000);
  });

  it("sends no stream index unless one was chosen, and never an invalid one", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [{ Id: "source-1", Path: "/media/movie.mkv", Protocol: "File", SupportsDirectPlay: true }],
    });
    await gateway.createPlaybackPlan(item, 0, undefined, "source-1", { audioStreamIndex: -1, subtitleStreamIndex: -2 });
    const request = transport.requests.at(-1)!;
    for (const sent of [request.data as Record<string, unknown>, request.params as Record<string, unknown>]) {
      expect(sent).not.toHaveProperty("AudioStreamIndex");
      expect(sent).not.toHaveProperty("SubtitleStreamIndex");
    }
  });

  it("reports whether the chosen version has media segments", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [
        { Id: "source-1", Path: "/media/a.mkv", Protocol: "File", SupportsDirectPlay: true, HasSegments: true },
        { Id: "source-2", Path: "/media/b.mkv", Protocol: "File", SupportsDirectPlay: true, HasSegments: false },
      ],
    });
    expect((await gateway.createPlaybackPlan(item, 0, undefined, "source-1")).hasSegments).toBe(true);
    expect((await gateway.createPlaybackPlan(item, 0, undefined, "source-2")).hasSegments).toBe(false);
  });

  it("asks for intro and outro segments with repeated type parameters and header auth", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set(
      "GET /MediaSegments/item%2Fone?includeSegmentTypes=Intro&includeSegmentTypes=Outro",
      { Items: [{ Id: "s1", Type: "Intro", StartTicks: 100_000_000, EndTicks: 700_000_000 }], TotalRecordCount: 1 },
    );
    const signal = new AbortController().signal;

    await expect(gateway.mediaSegments("item/one", signal)).resolves.toEqual([
      { kind: "Intro", startSeconds: 10, endSeconds: 70 },
    ]);

    const request = transport.requests.at(-1)!;
    expect(request.url).toBe("/MediaSegments/item%2Fone?includeSegmentTypes=Intro&includeSegmentTypes=Outro");
    expect(request.url).not.toMatch(/token|api_key|ApiKey/i);
    expect(request.params).toBeUndefined();
    expect(request.signal).toBe(signal);
    expect(JSON.stringify(request)).not.toContain("top-secret");
  });

  it("requests and plays the chosen version by MediaSourceId", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [
        { Id: "source-1", Path: "/media/a.mkv", Protocol: "File", SupportsDirectPlay: true },
        { Id: "source-2", Path: "/media/b.mkv", Protocol: "File", SupportsDirectPlay: true },
      ],
    });
    const plan = await gateway.createPlaybackPlan(item, 0, undefined, "source-2");
    const request = transport.requests.at(-1)!;
    expect(request.data).toEqual({
      ...PLAYBACK_INFO_FLAGS,
      AlwaysBurnInSubtitleWhenTranscoding: false,
      UserId: "user-1",
      StartTimeTicks: 0,
      MaxStreamingBitrate: 1000000000,
      MediaSourceId: "source-2",
      DeviceProfile: FLUSTER_PROFILE,
    });
    expect(request.params).not.toHaveProperty("MediaSourceId");
    expect(plan.mediaSourceId).toBe("source-2");
    expect(new URL(plan.streamUrl).searchParams.get("MediaSourceId")).toBe("source-2");
  });

  it("omits MediaSourceId when no version is chosen", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [{ Id: "source-1", Path: "/media/movie.mkv", Protocol: "File", SupportsDirectPlay: true }],
    });
    await gateway.createPlaybackPlan(item);
    expect(transport.requests.at(-1)!.data).not.toHaveProperty("MediaSourceId");
  });

  it.each([
    [{ Id: "hls", Path: "https://media.test/live.m3u8", Protocol: "Http", SupportsDirectPlay: true }, "not-a-file"],
    [{
      Id: "transcode",
      Path: "/media/movie.mkv",
      Protocol: "File",
      SupportsDirectPlay: true,
      TranscodingUrl: "/Videos/ActiveEncodings/x/master.m3u8",
    }, "unsafe-transcoding-url"],
    // The forced-fallback answer offers direct play again, so it is refused.
    [{ Id: "disc", Path: "/media/Disc", Protocol: "File", SupportsDirectPlay: true, VideoType: "BluRay" }, "disc-source"],
    [{ Id: "limited", Path: "/media/movie.mkv", Protocol: "File", SupportsDirectPlay: false }, "conversion-not-allowed"],
  ])("refuses %o with a typed reason", async (source, reason) => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", { PlaySessionId: "play-1", MediaSources: [source] });
    const error = await gateway.createPlaybackPlan(item).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlaybackRefusedError);
    expect((error as PlaybackRefusedError).reason).toBe(reason);
  });

  it("refuses a response without sources as no-sources, even without a play session", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", { MediaSources: [], ErrorCode: "NoCompatibleStream" });
    const error = await gateway.createPlaybackPlan(item).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlaybackRefusedError);
    expect((error as PlaybackRefusedError).reason).toBe("no-sources");
  });

  it("builds only the static original-file endpoint", () => {
    const url = new URL(buildStaticStreamUrl("https://media.test", "a/b", "source", "play"));
    expect(url.pathname).toBe("/Videos/a%2Fb/stream");
    expect(url.searchParams.get("Static")).toBe("true");
    expect(url.searchParams.get("MediaSourceId")).toBe("source");
    expect(url.searchParams.get("PlaySessionId")).toBe("play");
    expect([...url.searchParams.keys()]).toEqual(["Static", "MediaSourceId", "PlaySessionId"]);
  });

  it("keeps same-origin external subtitle URLs token-free and authenticates with the plan header", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [{
        Id: "source-1",
        Path: "/media/movie.mkv",
        Protocol: "File",
        SupportsDirectPlay: true,
        MediaStreams: [{
          Index: 3,
          Type: "Subtitle",
          IsExternal: true,
          DeliveryUrl: "/Videos/movie/Subtitles/3/Stream.srt?format=srt#ignored",
        }],
      }],
    });

    const plan = await gateway.createPlaybackPlan(item);
    const subtitleUrl = new URL(plan.tracks[0].deliveryUrl!);
    expect(subtitleUrl.origin).toBe("https://media.test");
    expect(subtitleUrl.searchParams.get("format")).toBe("srt");
    expect(subtitleUrl.href).not.toContain("top-secret");
    expect(subtitleUrl.hash).toBe("");
    expect(plan.streamUrl).not.toContain("top-secret");
    expect(plan.authorization).toBe(gateway.authorizationHeader());
    expect(plan.authorization).toContain('Token="top-secret"');
  });

  it("strips every server credential parameter from subtitle URLs", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [{
        Id: "source-1",
        Path: "/media/movie.mkv",
        Protocol: "File",
        SupportsDirectPlay: true,
        MediaStreams: [{
          Index: 0,
          Type: "Subtitle",
          IsExternal: true,
          DeliveryUrl: "/Videos/m/s/Subtitles/0/0/Stream.srt?ApiKey=a&apikey=b&API_KEY=c&access_token=d&Token=e&X-Emby-Token=f&format=srt",
        }],
      }],
    });

    const plan = await gateway.createPlaybackPlan(item);
    const url = new URL(plan.tracks[0].deliveryUrl!);
    expect([...url.searchParams.entries()]).toEqual([["format", "srt"]]);
  });

  it.each([
    "https://attacker.test/subtitle.srt",
    "https://name:password@media.test/subtitle.srt",
    "https://attacker.test/subtitle.srt?ApiKey=untrusted",
    "file:///tmp/subtitle.srt",
  ])("rejects unsafe subtitle URLs without exposing them: %s", async (deliveryUrl) => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [{
        Id: "source-1",
        Path: "/media/movie.mkv",
        Protocol: "File",
        SupportsDirectPlay: true,
        MediaStreams: [{ Index: 3, Type: "Subtitle", IsExternal: true, DeliveryUrl: deliveryUrl }],
      }],
    });

    let message = "";
    try {
      await gateway.createPlaybackPlan(item);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("unsafe external subtitle URL");
    expect(message).not.toContain(deliveryUrl);
    expect(message).not.toContain("top-secret");
    expect(message).not.toContain("password");
    expect(message).not.toContain("untrusted");
  });

  it("reports position and DirectPlay for start, progress, and stop", async () => {
    const { gateway, transport } = await authenticatedGateway();
    const plan: PlaybackPlan = {
      itemId: "item-1",
      title: "Movie",
      streamUrl: "https://media.test/video",
      authorization: 'MediaBrowser Token="secret"',
      mediaSourceId: "source-1",
      playSessionId: "play-1",
      startPositionTicks: 0,
      tracks: [],
      delivery: "static",
      playMethod: "DirectPlay",
      conversionReasons: [],
    };
    const snapshot: PlaybackSnapshot = {
      positionSeconds: 12.5,
      paused: true,
      buffering: false,
      volume: 72,
      muted: false,
      audioTrack: 2,
      subtitleTrack: 4,
      tracks: [],
      diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware — VA-API", droppedFrames: 0 },
    };
    await gateway.reportStart(plan, snapshot);
    await gateway.reportProgress(plan, snapshot);
    await gateway.reportStopped(plan, snapshot);
    const reports = transport.requests.slice(-3);
    expect(reports.map((request) => (request.data as { Failed?: boolean }).Failed)).toEqual([undefined, undefined, false]);
    expect(reports.map((request) => request.url)).toEqual([
      "/Sessions/Playing",
      "/Sessions/Playing/Progress",
      "/Sessions/Playing/Stopped",
    ]);
    for (const report of reports) {
      expect(report.data).toMatchObject({
        PlayMethod: "DirectPlay",
        PositionTicks: 125_000_000,
        MediaSourceId: "source-1",
        PlaySessionId: "play-1",
        IsPaused: true,
        VolumeLevel: 72,
        AudioStreamIndex: 2,
        SubtitleStreamIndex: 4,
      });
      expect(report.timeout).toBe(REPORT_REQUEST_TIMEOUT_MS);
    }
  });
});

describe("playstate reports carry the plan's play method", () => {
  const snapshot: PlaybackSnapshot = {
    positionSeconds: 1,
    paused: false,
    buffering: false,
    volume: 50,
    muted: false,
    tracks: [],
    diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
  };
  const base = {
    itemId: "item-1",
    title: "Movie",
    streamUrl: "https://media.test/video",
    authorization: 'MediaBrowser Token="secret"',
    mediaSourceId: "source-1",
    playSessionId: "play-1",
    startPositionTicks: 0,
    tracks: [],
  };
  const plans: Array<[string, PlaybackPlan]> = [
    ["DirectPlay", { ...base, delivery: "static", playMethod: "DirectPlay", conversionReasons: [] }],
    ["DirectStream", {
      ...base,
      delivery: "hls",
      playMethod: "DirectStream",
      conversionReasons: ["ContainerNotSupported"],
      serverUrl: "https://media.test",
      mediaKind: "videos",
    }],
    ["Transcode", {
      ...base,
      delivery: "hls",
      playMethod: "Transcode",
      conversionReasons: ["VideoCodecNotSupported"],
      serverUrl: "https://media.test",
      mediaKind: "videos",
    }],
  ];

  it.each(plans)("sends %s in start, progress, and stopped", async (method, plan) => {
    const { gateway, transport } = await authenticatedGateway();
    await gateway.reportStart(plan, snapshot);
    await gateway.reportProgress(plan, snapshot);
    await gateway.reportStopped(plan, snapshot);
    const reports = transport.requests.slice(-3);
    expect(reports.map((request) => request.url)).toEqual([
      "/Sessions/Playing",
      "/Sessions/Playing/Progress",
      "/Sessions/Playing/Stopped",
    ]);
    for (const report of reports) expect(report.data).toMatchObject({ PlayMethod: method });
  });
});

async function loginWith(installId: string, serverId: string, username: string) {
  const transport = new FakeTransport();
  transport.responses.set("GET /System/Info/Public", { Version: "10.11.0", Id: serverId });
  transport.responses.set("POST /Users/AuthenticateByName", {
    AccessToken: "top-secret",
    User: { Id: "user-1", Name: username },
  });
  const gateway = new JellyfinGateway("https://media.test", transport, installId);
  await gateway.connect();
  await gateway.login(username, "password");
  const login = transport.requests.find((request) => request.url === "/Users/AuthenticateByName")!;
  const header = login.headers?.Authorization ?? "";
  return { gateway, transport, deviceId: /DeviceId="([^"]+)"/.exec(header)?.[1], header };
}

describe("JellyfinGateway device identity and logout", () => {
  it("sends a stable derived DeviceId on login and no token", async () => {
    const first = await loginWith("install-1", "server-1", "Louise");
    const again = await loginWith("install-1", "server-1", "louise");
    expect(first.deviceId).toMatch(/^[0-9a-f]{64}$/);
    expect(again.deviceId).toBe(first.deviceId);
    expect(first.header).toContain('Device="Fluster%20Linux"');
    expect(first.header).toContain('Token=""');
  });

  it("derives different DeviceIds per install, server, and user", async () => {
    const base = await loginWith("install-1", "server-1", "Louise");
    const otherServer = await loginWith("install-1", "server-2", "Louise");
    const otherUser = await loginWith("install-1", "server-1", "Marc");
    const otherInstall = await loginWith("install-2", "server-1", "Louise");
    const ids = new Set([base.deviceId, otherServer.deviceId, otherUser.deviceId, otherInstall.deviceId]);
    expect(ids.size).toBe(4);
  });

  it("posts /Sessions/Logout with the token and clears local state", async () => {
    const { gateway, transport, deviceId } = await loginWith("install-1", "server-1", "Louise");
    await gateway.logout();
    const logout = transport.requests.at(-1)!;
    expect(logout.method).toBe("POST");
    expect(logout.url).toBe("/Sessions/Logout");
    expect(logout.timeout).toBe(REPORT_REQUEST_TIMEOUT_MS);
    expect(logout.headers?.Authorization).toContain('Token="top-secret"');
    expect(logout.headers?.Authorization).toContain(`DeviceId="${deviceId}"`);
    await expect(gateway.latest()).rejects.toThrow("Sign in");
  });

  it("exposes the signed-in authorization header for the server socket only while signed in", async () => {
    const { gateway, deviceId } = await loginWith("install-1", "server-1", "Louise");
    const header = gateway.authorizationHeader();
    expect(header).toMatch(/^MediaBrowser /);
    expect(header).toContain('Token="top-secret"');
    expect(header).toContain(`DeviceId="${deviceId}"`);
    await gateway.logout();
    expect(() => gateway.authorizationHeader()).toThrow("Sign in");
  });

  it("refuses the authorization header before sign-in", () => {
    const gateway = new JellyfinGateway("https://media.test", new FakeTransport(), "install-1");
    expect(() => gateway.authorizationHeader()).toThrow("Sign in");
  });

  it("clears local state even when the logout request fails", async () => {
    const { gateway, transport } = await loginWith("install-1", "server-1", "Louise");
    vi.spyOn(transport, "post").mockRejectedValueOnce(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(gateway.logout()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("top-secret");
    await expect(gateway.latest()).rejects.toThrow("Sign in");
    warn.mockRestore();
  });

  it("stops an active encoding with this device's id and the report timeout", async () => {
    const { gateway, transport, deviceId } = await loginWith("install-1", "server-1", "Louise");
    const controller = new AbortController();
    await gateway.stopActiveEncoding("play-1", controller.signal);
    const request = transport.requests.at(-1)!;
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe("/Videos/ActiveEncodings");
    expect(request.params).toEqual({ deviceId, playSessionId: "play-1" });
    expect(request.signal).toBe(controller.signal);
    expect(request.timeout).toBe(REPORT_REQUEST_TIMEOUT_MS);
  });

  it("refuses to stop an encoding before sign-in", async () => {
    const transport = new FakeTransport();
    const gateway = new JellyfinGateway("https://media.test", transport, "install-1");
    await expect(gateway.stopActiveEncoding("play-1")).rejects.toThrow("Sign in");
    expect(transport.requests).toEqual([]);
  });

  it("sends Failed on stopped reports only when requested", async () => {
    const { gateway, transport } = await authenticatedGateway();
    const plan: PlaybackPlan = { itemId: "i", mediaSourceId: "m", playSessionId: "p", startPositionTicks: 0, streamUrl: "", authorization: "", title: "t", tracks: [], delivery: "static", playMethod: "DirectPlay", conversionReasons: [] };
    const snapshot = { positionSeconds: 1, paused: false, buffering: false, volume: 50, muted: false, tracks: [], diagnostics: { decodeMode: "hardware", decodeLabel: "x", droppedFrames: 0 } } as PlaybackSnapshot;
    await gateway.reportStopped(plan, snapshot, undefined, true);
    expect(transport.requests.at(-1)!.data).toMatchObject({ Failed: true });
  });

  describe("Quick Connect", () => {
    function quickConnectGateway() {
      const transport = new FakeTransport();
      transport.responses.set("GET /System/Info/Public", { Version: "10.11.7", Id: "server-1" });
      const gateway = new JellyfinGateway("https://media.test", transport, "install-1");
      return { gateway, transport };
    }

    it("reads whether Quick Connect is enabled", async () => {
      const { gateway, transport } = quickConnectGateway();
      transport.responses.set("GET /QuickConnect/Enabled", true);
      await expect(gateway.quickConnectEnabled()).resolves.toBe(true);
      transport.responses.set("GET /QuickConnect/Enabled", false);
      await expect(gateway.quickConnectEnabled()).resolves.toBe(false);
      expect(transport.requests[0]).toMatchObject({ method: "GET", url: "/QuickConnect/Enabled" });
    });

    it("initiates with POST and the Fluster device header", async () => {
      const { gateway, transport } = quickConnectGateway();
      await gateway.connect();
      transport.responses.set("POST /QuickConnect/Initiate", { Secret: "s3cret", Code: "123456" });
      await expect(gateway.initiateQuickConnect()).resolves.toEqual({ secret: "s3cret", code: "123456" });
      const request = transport.requests.at(-1)!;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/QuickConnect/Initiate");
      expect(request.headers?.Authorization).toMatch(/^MediaBrowser /);
      expect(request.headers?.Authorization).toContain('DeviceId="');
      expect(request.headers?.Authorization).not.toMatch(/Token="[^"]/);
      expect(request.url).not.toContain("api_key");
    });

    it("rejects an initiate response without a code", async () => {
      const { gateway, transport } = quickConnectGateway();
      transport.responses.set("POST /QuickConnect/Initiate", {});
      await expect(gateway.initiateQuickConnect()).rejects.toThrow("Quick Connect code");
    });

    it("polls with the secret as a query parameter only", async () => {
      const { gateway, transport } = quickConnectGateway();
      transport.responses.set("GET /QuickConnect/Connect", { Authenticated: false, Secret: "s3cret" });
      await expect(gateway.pollQuickConnect("s3cret")).resolves.toEqual({ authenticated: false });
      transport.responses.set("GET /QuickConnect/Connect", { Authenticated: true });
      await expect(gateway.pollQuickConnect("s3cret")).resolves.toEqual({ authenticated: true });
      const request = transport.requests.at(-1)!;
      expect(request).toMatchObject({ method: "GET", url: "/QuickConnect/Connect", params: { secret: "s3cret" } });
      expect(request.url).not.toContain("api_key");
      expect(request.headers?.Authorization).not.toContain("s3cret");
    });

    it("uses one device id for initiate and authenticate, then starts a session", async () => {
      const { gateway, transport } = quickConnectGateway();
      await gateway.connect();
      transport.responses.set("POST /QuickConnect/Initiate", { Secret: "s3cret", Code: "123456" });
      transport.responses.set("POST /Users/AuthenticateWithQuickConnect", {
        AccessToken: "top-secret",
        User: { Id: "user-1", Name: "Louise" },
      });
      await gateway.initiateQuickConnect();
      await expect(gateway.authenticateWithQuickConnect("s3cret")).resolves.toEqual({ userId: "user-1", username: "Louise" });
      const [initiate, authenticate] = transport.requests.slice(-2);
      expect(authenticate).toMatchObject({ method: "POST", url: "/Users/AuthenticateWithQuickConnect", data: { Secret: "s3cret" } });
      expect(authenticate.params).toBeUndefined();
      const deviceId = (header?: string) => header?.match(/DeviceId="([^"]+)"/)?.[1];
      expect(deviceId(authenticate.headers?.Authorization)).toBe(deviceId(initiate.headers?.Authorization));

      transport.responses.set("GET /Items", { Items: [] });
      await expect(gateway.latest()).resolves.toEqual([]);
    });

    it("does not leak the secret through errors", async () => {
      const { gateway, transport } = quickConnectGateway();
      vi.spyOn(transport, "get").mockRejectedValueOnce(new Error("failed GET /QuickConnect/Connect?secret=qc-canary"));
      await expect(gateway.pollQuickConnect("qc-canary")).rejects.toThrow(/^((?!qc-canary).)*$/);
    });
  });
});

describe("JellyfinGateway home calls", () => {
  const cardParams = {
    fields: "PrimaryImageAspectRatio",
    imageTypeLimit: 1,
    enableImageTypes: "Primary,Backdrop,Thumb,Logo",
  };

  it("lists only movie, show, and collection libraries from /UserViews", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /UserViews", {
      Items: [
        { Id: "v1", Name: "Movies", CollectionType: "movies" },
        { Id: "v2", Name: "Shows", CollectionType: "tvshows" },
        { Id: "v3", Name: "Music", CollectionType: "music" },
        { Id: "v4", Name: "Sets", CollectionType: "boxsets" },
        { Id: "v5", Name: "Mixed" },
      ],
    });
    const controller = new AbortController();

    await expect(gateway.userViews(controller.signal)).resolves.toEqual([
      { id: "v1", name: "Movies", collectionType: "movies" },
      { id: "v2", name: "Shows", collectionType: "tvshows" },
      { id: "v4", name: "Sets", collectionType: "boxsets" },
    ]);
    const request = transport.requests.at(-1);
    expect(request?.url).toBe("/UserViews");
    expect(request?.params).toEqual({ userId: "user-1" });
    expect(request?.signal).toBe(controller.signal);
  });

  it("requests Continue Watching with minimal fields and maps progress and images", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /UserItems/Resume", {
      Items: [{
        Id: "ep-1",
        Name: "Pilot",
        Type: "Episode",
        SeriesName: "Show",
        ParentIndexNumber: 1,
        IndexNumber: 2,
        RunTimeTicks: 1000,
        PrimaryImageAspectRatio: 1.78,
        ImageTags: { Primary: "tag-1" },
        ImageBlurHashes: { Primary: { "tag-1": "LEHV6nWB2yk8pyo0adR*.7kCMdnj" } },
        UserData: { PlaybackPositionTicks: 250 },
      }, { Name: "No id" }],
    });

    await expect(gateway.resumeItems()).resolves.toEqual([{
      id: "ep-1",
      kind: "Episode",
      title: "Show",
      subtitle: "S1E2 · Pilot",
      image: { itemId: "ep-1", type: "Primary", tag: "tag-1", blurHash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" },
      aspectRatio: 1.78,
      progress: 0.25,
    }]);
    const request = transport.requests.at(-1);
    expect(request?.url).toBe("/UserItems/Resume");
    expect(request?.params).toEqual({
      userId: "user-1",
      mediaTypes: "Video",
      limit: 16,
      enableUserData: true,
      enableTotalRecordCount: false,
      ...cardParams,
    });
  });

  it("requests Next Up without rewatching", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Shows/NextUp", {
      Items: [{ Id: "ep-2", Name: "Second", Type: "Episode", SeriesName: "Show", SeriesId: "series-1", SeriesPrimaryImageTag: "s-tag" }],
    });

    await expect(gateway.nextUp()).resolves.toEqual([expect.objectContaining({
      id: "ep-2",
      image: { itemId: "series-1", type: "Primary", tag: "s-tag" },
    })]);
    const request = transport.requests.at(-1);
    expect(request?.url).toBe("/Shows/NextUp");
    expect(request?.params).toEqual({
      userId: "user-1",
      limit: 16,
      enableRewatching: false,
      enableTotalRecordCount: false,
      ...cardParams,
    });
  });

  it("reads the bare array from /Items/Latest for one library", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Items/Latest", [
      { Id: "m1", Name: "Arrival", Type: "Movie", ProductionYear: 2016, BackdropImageTags: ["b1"] },
    ]);

    await expect(gateway.latestInLibrary("lib-1")).resolves.toEqual([{
      id: "m1",
      kind: "Movie",
      title: "Arrival",
      subtitle: "2016",
      image: { itemId: "m1", type: "Backdrop", tag: "b1" },
      aspectRatio: 16 / 9,
    }]);
    const request = transport.requests.at(-1);
    expect(request?.url).toBe("/Items/Latest");
    expect(request?.params).toEqual({
      userId: "user-1",
      parentId: "lib-1",
      limit: 16,
      groupItems: true,
      ...cardParams,
    });
  });

  it("never asks for fields that are always returned", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Items/Latest", []);
    await gateway.latestInLibrary("lib-1");
    const fields = String(transport.requests.at(-1)?.params?.fields);
    expect(fields).not.toMatch(/ProductionYear|RunTimeTicks/);
  });

  it("pages library items without a total count and detects more pages with one extra item", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Items", {
      Items: [
        { Id: "s1", Name: "Show", Type: "Series" },
        { Id: "m1", Name: "Movie", Type: "Movie" },
        { Id: "m2", Name: "Extra", Type: "Movie" },
      ],
    });

    const page = await gateway.libraryItems("lib-1", {
      itemTypes: ["Movie", "Series"],
      startIndex: 60,
      limit: 2,
      sortBy: "DateCreated",
      sortOrder: "Descending",
      filters: ["IsUnplayed", "IsFavorite"],
    });

    expect(page.hasMore).toBe(true);
    expect(page.cards.map((card) => [card.id, card.kind])).toEqual([["s1", "Series"], ["m1", "Movie"]]);
    const request = transport.requests.at(-1);
    expect(request?.url).toBe("/Items");
    expect(request?.params).toEqual({
      userId: "user-1",
      parentId: "lib-1",
      recursive: true,
      includeItemTypes: "Movie,Series",
      sortBy: "DateCreated",
      sortOrder: "Descending",
      filters: "IsUnplayed,IsFavorite",
      startIndex: 60,
      limit: 3,
      enableUserData: true,
      enableTotalRecordCount: false,
      ...cardParams,
    });
    expect(JSON.stringify(request?.params)).not.toMatch(/top-secret|api_key|token/i);
  });

  it("omits filters when none are selected and reports the last page", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Items", { Items: [{ Id: "b1", Name: "Set", Type: "BoxSet" }] });
    const page = await gateway.libraryItems("lib-2", {
      itemTypes: ["BoxSet"], startIndex: 0, limit: 60, sortBy: "SortName", sortOrder: "Ascending", filters: [],
    });
    expect(page.hasMore).toBe(false);
    expect(page.cards[0]?.kind).toBe("BoxSet");
    expect(transport.requests.at(-1)?.params).not.toHaveProperty("filters");
    expect(transport.requests.at(-1)?.params?.includeItemTypes).toBe("BoxSet");
  });

  it("pages from the raw list so an invalid item cannot hide the next page", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Items", {
      Items: [{ Id: "a", Name: "A", Type: "Movie" }, { Name: "No id", Type: "Movie" }, { Id: "c", Name: "C", Type: "Movie" }],
    });
    const page = await gateway.libraryItems("lib-1", {
      itemTypes: ["Movie"], startIndex: 0, limit: 2, sortBy: "SortName", sortOrder: "Ascending", filters: [],
    });
    // Two raw items fill the page; the third proves there is more.
    expect(page.cards.map((card) => card.id)).toEqual(["a"]);
    expect(page.hasMore).toBe(true);
  });

  it("fetches type-ahead hints from /Search/Hints", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Search/Hints", {
      SearchHints: [
        { Id: "s1", Name: "Show", Type: "Series", ProductionYear: 2020 },
        { Id: "e1", Name: "Pilot", Type: "Episode", Series: "Show" },
        { Id: "p1", Name: "Person", Type: "Person" },
        { Name: "No id", Type: "Movie" },
      ],
    });
    await expect(gateway.searchHints("sho")).resolves.toEqual([
      { id: "s1", name: "Show", kind: "Series", year: 2020 },
      { id: "e1", name: "Pilot", kind: "Episode", seriesName: "Show" },
    ]);
    const request = transport.requests.at(-1);
    expect(request?.url).toBe("/Search/Hints");
    expect(request?.params).toEqual({ userId: "user-1", searchTerm: "sho", limit: 8, includeItemTypes: "Movie,Series,Episode" });
    expect(JSON.stringify(request?.params)).not.toMatch(/top-secret|api_key|token/i);
  });

  it("pages search results from /Items?searchTerm", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Items", {
      Items: [
        { Id: "s1", Name: "Show", Type: "Series" },
        { Id: "m1", Name: "Movie", Type: "Movie" },
        { Id: "e1", Name: "Pilot", Type: "Episode" },
      ],
    });
    const page = await gateway.searchItems("sho", { startIndex: 40, limit: 2 });
    expect(page.hasMore).toBe(true);
    expect(page.cards.map((card) => [card.id, card.kind])).toEqual([["s1", "Series"], ["m1", "Movie"]]);
    const request = transport.requests.at(-1);
    expect(request?.url).toBe("/Items");
    expect(request?.params).toEqual({
      userId: "user-1",
      searchTerm: "sho",
      recursive: true,
      includeItemTypes: "Movie,Series,Episode",
      sortBy: "SortName",
      sortOrder: "Ascending",
      startIndex: 40,
      limit: 3,
      enableUserData: true,
      enableTotalRecordCount: false,
      ...cardParams,
    });
    expect(JSON.stringify(request?.params)).not.toMatch(/top-secret|api_key|token/i);
  });

  it("lists seasons with minimal fields", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Shows/series-1/Seasons", { Items: [{ Id: "sp", Name: "Specials", IndexNumber: 0 }, { Id: "se1", Name: "Season 1", IndexNumber: 1 }, { Name: "No id" }] });
    await expect(gateway.seasons("series-1")).resolves.toEqual([
      { id: "sp", name: "Specials", indexNumber: 0 },
      { id: "se1", name: "Season 1", indexNumber: 1 },
    ]);
    const request = transport.requests.at(-1);
    expect(request?.params).toEqual({ userId: "user-1", fields: "PrimaryImageAspectRatio" });
  });

  it("lists the episodes of one season", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /Shows/series-1/Episodes", {
      Items: [{ Id: "e1", Name: "Pilot", Type: "Episode", IndexNumber: 1, Overview: "It begins.", SeriesName: "Show" }],
    });
    await expect(gateway.episodes("series-1", "se1")).resolves.toEqual([
      { id: "e1", kind: "Episode", title: "Pilot", subtitle: "Episode 1", overview: "It begins.", aspectRatio: 2 / 3 },
    ]);
    expect(transport.requests.at(-1)?.params).toEqual({
      userId: "user-1",
      seasonId: "se1",
      fields: "Overview,PrimaryImageAspectRatio",
      enableUserData: true,
      imageTypeLimit: 1,
      enableImageTypes: "Primary,Backdrop,Thumb,Logo",
    });
  });

  describe("nextEpisode", () => {
    it("asks for the siblings of the episode and returns the one after it", async () => {
      const { gateway, transport } = await authenticatedGateway();
      transport.responses.set("GET /Shows/series-1/Episodes", {
        Items: [
          { Id: "e1", Name: "Pilot", Type: "Episode", ParentIndexNumber: 1, IndexNumber: 1 },
          { Id: "e2", Name: "Second", Type: "Episode", ParentIndexNumber: 1, IndexNumber: 2 },
          { Id: "e3", Name: "Third", Type: "Episode", ParentIndexNumber: 1, IndexNumber: 3 },
        ],
      });
      await expect(gateway.nextEpisode("series-1", "e2")).resolves.toEqual({ id: "e3", title: "Third", label: "S1E3" });
      const request = transport.requests.at(-1);
      expect(request?.params).toEqual({ userId: "user-1", adjacentTo: "e2", isMissing: false });
      // Auth rides in the transport's Authorization header, never in the URL or params.
      expect(request?.url).toBe("/Shows/series-1/Episodes");
      expect(JSON.stringify(request?.params)).not.toMatch(/token|api_key|top-secret/i);
    });

    it("finds the next episode when the current one is first", async () => {
      const { gateway, transport } = await authenticatedGateway();
      transport.responses.set("GET /Shows/series-1/Episodes", {
        Items: [{ Id: "e1", Name: "Pilot" }, { Id: "e2", Name: "Second" }],
      });
      await expect(gateway.nextEpisode("series-1", "e1")).resolves.toEqual({ id: "e2", title: "Second" });
    });

    it("skips virtual (missing) episodes", async () => {
      const { gateway, transport } = await authenticatedGateway();
      transport.responses.set("GET /Shows/series-1/Episodes", {
        Items: [
          { Id: "e1", Name: "Pilot", LocationType: "FileSystem" },
          { Id: "e2", Name: "Missing", LocationType: "Virtual" },
          { Id: "e3", Name: "Third", LocationType: "FileSystem" },
        ],
      });
      await expect(gateway.nextEpisode("series-1", "e1")).resolves.toEqual({ id: "e3", title: "Third" });
    });

    it("returns undefined for the last episode", async () => {
      const { gateway, transport } = await authenticatedGateway();
      transport.responses.set("GET /Shows/series-1/Episodes", {
        Items: [{ Id: "e1", Name: "Pilot" }, { Id: "e2", Name: "Second" }],
      });
      await expect(gateway.nextEpisode("series-1", "e2")).resolves.toBeUndefined();
    });

    it("returns undefined when the current episode is not in the answer", async () => {
      const { gateway, transport } = await authenticatedGateway();
      transport.responses.set("GET /Shows/series-1/Episodes", { Items: [{ Id: "x", Name: "Other" }] });
      await expect(gateway.nextEpisode("series-1", "e2")).resolves.toBeUndefined();
    });
  });

  it("builds tagged image URLs with no credentials", async () => {
    const { gateway } = await authenticatedGateway();
    const url = new URL(gateway.imageUrl("item/one", "Primary", "tag-1", 320));
    expect(url.origin + url.pathname).toBe("https://media.test/jellyfin/Items/item%2Fone/Images/Primary");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tag: "tag-1",
      maxWidth: "320",
      quality: "90",
      format: "Webp",
    });
    expect(url.href).not.toContain("top-secret");
    expect(url.href).not.toMatch(/api_key|token/i);
  });

  it("requires a signed-in session", async () => {
    const gateway = new JellyfinGateway("https://media.test", new FakeTransport(), "install-1");
    await expect(gateway.resumeItems()).rejects.toThrow("Sign in");
  });
});

class MemoryConfirmations implements LanHttpConfirmationStore {
  records: LanHttpConfirmation[] = [];
  has(confirmation: LanHttpConfirmation): boolean {
    return this.records.some((record) => record.serverId === confirmation.serverId && record.origin === confirmation.origin);
  }
  remember(confirmation: LanHttpConfirmation): void {
    this.records.push({ ...confirmation });
  }
}

describe("JellyfinGateway plain-HTTP policy (docs/decisions/0001)", () => {
  const LAN_URL = "http://192.168.1.5:8096";

  function lanTransport(serverId: string | null = "server-1") {
    const transport = new FakeTransport();
    transport.responses.set("GET /System/Info/Public", { ServerName: "Living Room", Version: "10.11.7", Id: serverId ?? undefined });
    transport.responses.set("POST /Users/AuthenticateByName", {
      AccessToken: "top-secret",
      User: { Id: "user-1", Name: "Louise" },
    });
    transport.responses.set("POST /QuickConnect/Initiate", { Secret: "s3cret", Code: "123456" });
    return transport;
  }

  it("refuses a public http:// server in the constructor, before any request", () => {
    const transport = new FakeTransport();
    expect(() => new JellyfinGateway("http://media.example:8096", transport)).toThrow(PUBLIC_HTTP_REFUSED_MESSAGE);
    expect(transport.requests).toEqual([]);
  });

  it("refuses a public http:// server without creating an HTTP client", () => {
    const create = vi.spyOn(axios, "create");
    try {
      expect(() => new JellyfinGateway("http://8.8.8.8:8096")).toThrow(PUBLIC_HTTP_REFUSED_MESSAGE);
      expect(create).not.toHaveBeenCalled();
    } finally {
      create.mockRestore();
    }
  });

  it("probes a private-LAN server and reports that confirmation is needed", async () => {
    const transport = lanTransport();
    const gateway = new JellyfinGateway(LAN_URL, transport, "install-1", new MemoryConfirmations());
    await expect(gateway.connect()).resolves.toEqual({
      name: "Living Room",
      id: "server-1",
      version: "10.11.7",
      hostClass: "private-lan",
      needsUnencryptedConfirmation: true,
    });
    expect(transport.requests.map((request) => request.url)).toEqual(["/System/Info/Public"]);
    expect(transport.requests[0].headers?.Authorization ?? "").not.toContain("Token=");
  });

  it.each([
    ["login", (gateway: JellyfinGateway) => gateway.login("Louise", "hunter2")],
    ["initiateQuickConnect", (gateway: JellyfinGateway) => gateway.initiateQuickConnect()],
    ["pollQuickConnect", (gateway: JellyfinGateway) => gateway.pollQuickConnect("s3cret")],
    ["authenticateWithQuickConnect", (gateway: JellyfinGateway) => gateway.authenticateWithQuickConnect("s3cret")],
  ])("refuses %s on an unconfirmed private-LAN HTTP server without a request", async (_name, call) => {
    const transport = lanTransport();
    const gateway = new JellyfinGateway(LAN_URL, transport, "install-1", new MemoryConfirmations());
    await gateway.connect();
    await expect(call(gateway)).rejects.toThrow(UNENCRYPTED_NOT_CONFIRMED_MESSAGE);
    expect(transport.requests.map((request) => request.url)).toEqual(["/System/Info/Public"]);
  });

  it("refuses sign-in when connect() was skipped", async () => {
    const transport = lanTransport();
    const gateway = new JellyfinGateway(LAN_URL, transport, "install-1", new MemoryConfirmations());
    expect(() => gateway.confirmUnencryptedConnection()).toThrow("Connect to the server");
    await expect(gateway.login("Louise", "hunter2")).rejects.toThrow(UNENCRYPTED_NOT_CONFIRMED_MESSAGE);
    expect(transport.requests).toEqual([]);
  });

  it("signs in after confirmation and remembers it per server Id and origin", async () => {
    const confirmations = new MemoryConfirmations();
    const first = new JellyfinGateway(LAN_URL, lanTransport(), "install-1", confirmations);
    await first.connect();
    first.confirmUnencryptedConnection();
    await expect(first.login("Louise", "hunter2")).resolves.toEqual({ userId: "user-1", username: "Louise" });
    expect(confirmations.records).toEqual([{ serverId: "server-1", origin: LAN_URL }]);
    expect(JSON.stringify(confirmations.records)).not.toContain("top-secret");

    const again = new JellyfinGateway(`${LAN_URL}/`, lanTransport(), "install-1", confirmations);
    await expect(again.connect()).resolves.toMatchObject({ needsUnencryptedConfirmation: false });
    await expect(again.login("Louise", "hunter2")).resolves.toMatchObject({ userId: "user-1" });
  });

  it("asks again for a different server Id at a confirmed origin", async () => {
    const confirmations = new MemoryConfirmations();
    confirmations.remember({ serverId: "server-1", origin: LAN_URL });
    const gateway = new JellyfinGateway(LAN_URL, lanTransport("server-2"), "install-1", confirmations);
    await expect(gateway.connect()).resolves.toMatchObject({ needsUnencryptedConfirmation: true });
    await expect(gateway.login("Louise", "hunter2")).rejects.toThrow(UNENCRYPTED_NOT_CONFIRMED_MESSAGE);
  });

  it.each(["http://192.168.1.5:8920", "http://192.168.1.6:8096", "http://nas.local:8096"])(
    "asks again for a known server Id at another origin: %s",
    async (serverUrl) => {
      const confirmations = new MemoryConfirmations();
      confirmations.remember({ serverId: "server-1", origin: LAN_URL });
      const gateway = new JellyfinGateway(serverUrl, lanTransport(), "install-1", confirmations);
      await expect(gateway.connect()).resolves.toMatchObject({ needsUnencryptedConfirmation: true });
    },
  );

  it("refuses a private-LAN HTTP server that does not report an Id", async () => {
    const gateway = new JellyfinGateway(LAN_URL, lanTransport(null), "install-1", new MemoryConfirmations());
    await expect(gateway.connect()).rejects.toThrow("did not report its Id");
  });

  it.each(["http://127.0.0.1:8096", "http://[::1]:8096", "https://192.168.1.5:8920", "https://media.test"])(
    "needs no confirmation for %s",
    async (serverUrl) => {
      const confirmations = new MemoryConfirmations();
      const gateway = new JellyfinGateway(serverUrl, lanTransport(), "install-1", confirmations);
      await expect(gateway.connect()).resolves.toMatchObject({ needsUnencryptedConfirmation: false });
      await expect(gateway.login("Louise", "hunter2")).resolves.toMatchObject({ userId: "user-1" });
      gateway.confirmUnencryptedConnection();
      expect(confirmations.records).toEqual([]);
    },
  );
});

// In WebKitGTK the fetch adapter's `redirect: "manual"` yields an opaque
// redirect with status 0, and Axios resolves it instead of rejecting.
describe("JellyfinGateway resolved redirect responses", () => {
  const plan: PlaybackPlan = { itemId: "i", mediaSourceId: "m", playSessionId: "p", startPositionTicks: 0, streamUrl: "", authorization: "", title: "t", tracks: [], delivery: "static", playMethod: "DirectPlay", conversionReasons: [] };
  const snapshot = { positionSeconds: 1, paused: false, buffering: false, volume: 50, muted: false, tracks: [], diagnostics: { decodeMode: "hardware", decodeLabel: "x", droppedFrames: 0 } } as PlaybackSnapshot;

  it.each([0, 302, 307])("refuses a probe that resolves with status %i", async (status) => {
    const transport = new FakeTransport();
    transport.responses.set("GET /System/Info/Public", { ServerName: "Home", Version: "10.11.7", Id: "server-1" });
    transport.statuses.set("GET /System/Info/Public", status);
    await expect(new JellyfinGateway("https://media.test", transport).connect()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
  });

  it("refuses a sign-in that resolves with status 0", async () => {
    const transport = new FakeTransport();
    transport.statuses.set("POST /Users/AuthenticateByName", 0);
    const gateway = new JellyfinGateway("https://media.test", transport, "install-1");
    await expect(gateway.login("Louise", "hunter2")).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
  });

  it("refuses a list call that resolves with status 0 instead of returning no rows", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.statuses.set("GET /UserViews", 0);
    await expect(gateway.userViews()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
  });

  it("refuses a playstate report that resolves with status 0", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.statuses.set("POST /Sessions/Playing/Progress", 0);
    await expect(gateway.reportProgress(plan, snapshot)).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
  });

  it("reports a logout that resolves with status 0 as failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { gateway, transport } = await authenticatedGateway();
      transport.statuses.set("POST /Sessions/Logout", 0);
      await gateway.logout();
      expect(warn).toHaveBeenCalledWith("Server logout failed; the local session was cleared.", REDIRECT_REFUSED_MESSAGE);
    } finally {
      warn.mockRestore();
    }
  });

  it("accepts a resolved 200 response", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("GET /UserViews", { Items: [] });
    transport.statuses.set("GET /UserViews", 200);
    await expect(gateway.userViews()).resolves.toEqual([]);
  });
});
