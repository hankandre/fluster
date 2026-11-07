import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackSnapshot } from "../../domain/playback";
import {
  buildStaticStreamUrl,
  CONTROL_REQUEST_TIMEOUT_MS,
  DIRECT_PLAY_REQUEST,
  JellyfinGateway,
  REPORT_REQUEST_TIMEOUT_MS,
  selectDirectFileSource,
} from "./gateway";
import type { HttpRequestConfig, HttpTransport } from "./types";

interface RequestRecord {
  method: "GET" | "POST";
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

  async get<T>(url: string, config?: HttpRequestConfig): Promise<{ data: T }> {
    this.requests.push({
      method: "GET",
      url,
      params: config?.params,
      headers: config?.headers,
      signal: config?.signal,
      timeout: config?.timeout,
    });
    return { data: this.responses.get(`GET ${url}`) as T };
  }

  async post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<{ data: T }> {
    this.requests.push({
      method: "POST",
      url,
      data,
      params: config?.params,
      headers: config?.headers,
      signal: config?.signal,
      timeout: config?.timeout,
    });
    return { data: this.responses.get(`POST ${url}`) as T };
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
  it("accepts HTTPS and loopback HTTP server URLs", () => {
    const transport = new FakeTransport();
    expect(new JellyfinGateway("https://media.test/jellyfin/", transport).serverUrl)
      .toBe("https://media.test/jellyfin");
    expect(new JellyfinGateway("http://localhost:8096", transport).serverUrl)
      .toBe("http://localhost:8096");
    expect(new JellyfinGateway("http://127.0.0.1:8096", transport).serverUrl)
      .toBe("http://127.0.0.1:8096");
  });

  it.each([
    "http://media.test",
    "http://localhost.example.com",
    "http://127.42.7.9:8096",
    "http://[::1]:8096",
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

  it("always disables direct stream, remux, and transcoding in query and body", async () => {
    const { gateway, transport } = await authenticatedGateway();
    transport.responses.set("POST /Items/item/one/PlaybackInfo", {
      PlaySessionId: "play-1",
      MediaSources: [{ Id: "source-1", Path: "/media/movie.mkv", Protocol: "File", SupportsDirectPlay: true }],
    });
    await gateway.createPlaybackPlan(item);
    const request = transport.requests.at(-1)!;
    expect(request.data).toMatchObject(DIRECT_PLAY_REQUEST);
    expect(request.params).toMatchObject({
      EnableDirectPlay: true,
      EnableDirectStream: false,
      EnableTranscoding: false,
      AllowVideoStreamCopy: false,
      AllowAudioStreamCopy: false,
    });
  });

  it("rejects HLS, remote HTTP, and transcoding responses", () => {
    expect(() => selectDirectFileSource([{
      Id: "hls",
      Path: "https://media.test/live.m3u8",
      Protocol: "Http",
      SupportsDirectPlay: true,
    }])).toThrow("No static, file-backed direct-play source");
    expect(() => selectDirectFileSource([{
      Id: "transcode",
      Path: "/media/movie.mkv",
      Protocol: "File",
      SupportsDirectPlay: true,
      TranscodingUrl: "/Videos/ActiveEncodings/x/master.m3u8",
    }])).toThrow("No static, file-backed direct-play source");
  });

  it("builds only the static original-file endpoint", () => {
    const url = new URL(buildStaticStreamUrl("https://media.test", "a/b", "source", "play", "secret"));
    expect(url.pathname).toBe("/Videos/a%2Fb/stream");
    expect(url.searchParams.get("Static")).toBe("true");
    expect(url.searchParams.get("MediaSourceId")).toBe("source");
    expect(url.searchParams.get("PlaySessionId")).toBe("play");
    expect(url.searchParams.get("api_key")).toBe("secret");
  });

  it("authenticates same-origin external subtitle URLs", async () => {
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
    expect(subtitleUrl.searchParams.get("api_key")).toBe("top-secret");
    expect(subtitleUrl.hash).toBe("");
  });

  it.each([
    "https://attacker.test/subtitle.srt",
    "https://name:password@media.test/subtitle.srt",
    "/subtitle.srt?api_key=untrusted",
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
    const plan = {
      itemId: "item-1",
      title: "Movie",
      streamUrl: "https://media.test/video?api_key=secret",
      mediaSourceId: "source-1",
      playSessionId: "play-1",
      startPositionTicks: 0,
      tracks: [],
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

  it("sends Failed on stopped reports only when requested", async () => {
    const { gateway, transport } = await authenticatedGateway();
    const plan = { itemId: "i", mediaSourceId: "m", playSessionId: "p", startPositionTicks: 0, streamUrl: "", title: "t", tracks: [] };
    const snapshot = { positionSeconds: 1, paused: false, buffering: false, volume: 50, muted: false, tracks: [], diagnostics: { decodeMode: "hardware", decodeLabel: "x", droppedFrames: 0 } } as PlaybackSnapshot;
    await gateway.reportStopped(plan, snapshot, undefined, true);
    expect(transport.requests.at(-1)!.data).toMatchObject({ Failed: true });
  });
});
