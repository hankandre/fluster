import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem, PlaybackSnapshot } from "../../domain/playback";
import { buildStaticStreamUrl, DIRECT_PLAY_REQUEST, JellyfinGateway, selectDirectFileSource } from "./gateway";
import type { HttpTransport } from "./types";

interface RequestRecord {
  method: "GET" | "POST";
  url: string;
  data?: unknown;
  params?: Record<string, unknown>;
}

class FakeTransport implements HttpTransport {
  requests: RequestRecord[] = [];
  responses = new Map<string, unknown>();

  async get<T>(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: T }> {
    this.requests.push({ method: "GET", url, params: config?.params });
    return { data: this.responses.get(`GET ${url}`) as T };
  }

  async post<T>(url: string, data?: unknown, config?: { params?: Record<string, unknown> }): Promise<{ data: T }> {
    this.requests.push({ method: "POST", url, data, params: config?.params });
    return { data: this.responses.get(`POST ${url}`) as T };
  }
}

const item: LibraryItem = { id: "item/one", name: "Arrival", type: "Movie" };

function authenticatedGateway() {
  const transport = new FakeTransport();
  transport.responses.set("POST /Users/AuthenticateByName", {
    AccessToken: "top-secret",
    User: { Id: "user-1", Name: "Louise" },
  });
  const gateway = new JellyfinGateway("https://media.test/jellyfin/", transport);
  return gateway.login("Louise", "password").then(() => ({ gateway, transport }));
}

describe("JellyfinGateway direct-play contract", () => {
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
      expect(create).toHaveBeenCalledWith({ baseURL: "https://media.test/jellyfin" });
      expect(isolatedAxios.defaults.headers.common.Authorization).toContain('Client="Fluster"');
      expect(get).toHaveBeenCalledWith("/System/Info/Public");
    } finally {
      create.mockRestore();
    }
  });

  it("accepts only Jellyfin 10.11 servers", async () => {
    const transport = new FakeTransport();
    transport.responses.set("GET /System/Info/Public", { ServerName: "Home", Version: "10.11.7" });
    await expect(new JellyfinGateway("https://media.test", transport).connect()).resolves.toEqual({
      name: "Home",
      version: "10.11.7",
    });
    transport.responses.set("GET /System/Info/Public", { Version: "10.10.7" });
    await expect(new JellyfinGateway("https://media.test", transport).connect()).rejects.toThrow("supports Jellyfin 10.11.x");
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
    }
  });
});
