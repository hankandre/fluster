import { expect, type Page } from "@playwright/test";

export const serverUrl = "http://127.0.0.1:8096";

const fileSource = {
  Id: "src-hd",
  Name: "1080p",
  Container: "mp4",
  Path: "/media/arrival.mp4",
  Protocol: "File",
  SupportsDirectPlay: true,
  MediaStreams: [{ Index: 0, Type: "Video", Codec: "h264", DisplayTitle: "H.264", IsExternal: false, IsDefault: true, IsForced: false }],
};

// English (AAC) and French (AC-3) audio, for track-change journeys.
const audioStreams = [
  { Index: 1, Type: "Audio", Codec: "aac", Language: "eng", DisplayTitle: "English AAC", IsExternal: false, IsDefault: true, IsForced: false },
  { Index: 2, Type: "Audio", Codec: "ac3", Language: "fre", DisplayTitle: "French AC3", IsExternal: false, IsDefault: false, IsForced: false },
];

const discSource = {
  Id: "src-disc",
  Name: "Blu-ray",
  Path: "/media/Disc/BDMV",
  Protocol: "File",
  VideoType: "BluRay",
  SupportsDirectPlay: true,
  MediaStreams: [],
};

export interface ServerOptions {
  resumeTicks?: number;
  // /UserItems/Resume lists Arrival (movie-1) at resumeTicks, so Home has a Continue watching card.
  homeResume?: boolean;
  // The server offers the disc for direct play; the forced-fallback request
  // (EnableDirectPlay false) gets neither direct play nor a conversion.
  disc?: boolean;
  // The first N PlaybackInfo answers offer neither direct play nor a conversion.
  noDirectPlayAnswers?: number;
  // Every PlaybackInfo answer is an HLS conversion instead of direct play.
  converted?: boolean;
  // TranscodeReasons the converted answer names (default: a bitrate limit, so a Transcode).
  conversionReasons?: string;
  // Extra query text on the converted TranscodingUrl, for example "&SubtitleMethod=Encode".
  conversionQuery?: string;
  failPlayback?: boolean;
  playbackDelayMs?: number;
  // Playstate reports are logged on arrival but answered only after releaseReports().
  holdReports?: boolean;
  // The PlaybackInfo source reports HasSegments, and the segments endpoint answers with these items.
  segments?: Array<Record<string, unknown>>;
  hasSegments?: boolean;
  // The source has two audio streams. A converted answer carries the
  // requested AudioStreamIndex (default 1), as Jellyfin does.
  audioStreams?: boolean;
}

export interface ServerLog {
  playbackInfo: Array<Record<string, unknown>>;
  playbackInfoQueries: URLSearchParams[];
  reports: Array<{ path: string; body: Record<string, unknown> }>;
  // PlaybackInfo, playstate, and ActiveEncodings requests in arrival order.
  sequence: string[];
  segmentRequests: Array<{ search: string; authorization: string | undefined }>;
  requestUrls: string[];
  releaseReports(): void;
}

// Mocks a server with one movie and the original-file playback endpoints.
export async function mockPlayerServer(page: Page, options: ServerOptions = {}): Promise<ServerLog> {
  let releaseReports = () => undefined as void;
  const reportGate = new Promise<void>((resolve) => { releaseReports = resolve; });
  const log: ServerLog = {
    playbackInfo: [],
    playbackInfoQueries: [],
    reports: [],
    sequence: [],
    segmentRequests: [],
    requestUrls: [],
    releaseReports: () => releaseReports(),
  };
  const base = options.disc ? discSource : fileSource;
  const source = {
    ...base,
    HasSegments: options.hasSegments ?? false,
    ...(options.audioStreams ? { MediaStreams: [...base.MediaStreams, ...audioStreams], DefaultAudioStreamIndex: 1 } : {}),
  };

  await page.addInitScript(({ shouldFail }) => {
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 120 });
    HTMLMediaElement.prototype.play = function play() {
      queueMicrotask(() => {
        this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("playing"));
        if (shouldFail) this.dispatchEvent(new Event("error"));
      });
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event("pause"));
    };
    HTMLMediaElement.prototype.load = () => undefined;
  }, { shouldFail: Boolean(options.failPlayback) });

  await page.route(`${serverUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    const json = (body: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    log.requestUrls.push(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.startsWith("/Sessions/Playing")) {
      const body = request.postDataJSON() as Record<string, unknown>;
      log.reports.push({ path: url.pathname, body });
      log.sequence.push(`${url.pathname} ${String(body.PlaySessionId)}`);
      if (options.holdReports) await reportGate;
      return route.fulfill({ status: 204, headers: cors });
    }
    switch (url.pathname) {
      case "/System/Info/Public":
        return json({ ServerName: "Testfin", Version: "10.11.7", Id: "server-1" });
      case "/QuickConnect/Enabled":
        return json(true);
      case "/QuickConnect/Initiate":
        return json({ Secret: "e2e-secret", Code: "482913", Authenticated: false });
      case "/QuickConnect/Connect":
        return json({ Secret: "e2e-secret", Code: "482913", Authenticated: true });
      case "/Users/AuthenticateWithQuickConnect":
        return json({ AccessToken: "test-token", User: { Id: "user-1", Name: "Tester" } });
      case "/UserViews":
        return json({ Items: [{ Id: "lib-1", Name: "Movies", CollectionType: "movies" }] });
      case "/UserItems/Resume":
        return json({
          Items: options.homeResume
            ? [{
              Id: "movie-1", Name: "Arrival", Type: "Movie", ProductionYear: 2016, RunTimeTicks: 1_200_000_000,
              UserData: { Played: false, PlaybackPositionTicks: options.resumeTicks ?? 0 },
            }]
            : [],
        });
      case "/Shows/NextUp":
        return json({ Items: [] });
      case "/Items/Latest":
        return json([{ Id: "movie-1", Name: "Arrival", Type: "Movie", ProductionYear: 2016 }]);
      case "/Items/movie-1":
        return json({
          Id: "movie-1",
          Name: "Arrival",
          Type: "Movie",
          ProductionYear: 2016,
          RunTimeTicks: 1_200_000_000,
          MediaSources: [source],
          UserData: { Played: false, IsFavorite: false, PlaybackPositionTicks: options.resumeTicks ?? 0 },
        });
      case "/Videos/ActiveEncodings":
        log.sequence.push(`DELETE ActiveEncodings ${url.searchParams.get("playSessionId")}`);
        return route.fulfill({ status: 204, headers: cors });
      case "/Items/movie-1/PlaybackInfo":
        log.playbackInfo.push(request.postDataJSON());
        log.playbackInfoQueries.push(url.searchParams);
        log.sequence.push(`PlaybackInfo play-${log.playbackInfo.length}`);
        if (options.playbackDelayMs) await new Promise((resolve) => setTimeout(resolve, options.playbackDelayMs));
        if (options.disc && url.searchParams.get("EnableDirectPlay") === "false") {
          return json({ PlaySessionId: `play-${log.playbackInfo.length}`, MediaSources: [{ ...source, SupportsDirectPlay: false }] });
        }
        if (options.converted) {
          const audioIndex = options.audioStreams ? Number(url.searchParams.get("AudioStreamIndex") ?? 1) : undefined;
          return json({
            PlaySessionId: `play-${log.playbackInfo.length}`,
            MediaSources: [{
              ...source,
              ...(audioIndex !== undefined ? { DefaultAudioStreamIndex: audioIndex } : {}),
              SupportsDirectPlay: false,
              TranscodingSubProtocol: "hls",
              TranscodingUrl: `/videos/movie-1/master.m3u8?MediaSourceId=${source.Id}&VideoCodec=h264&AudioCodec=aac${audioIndex !== undefined ? `&AudioStreamIndex=${audioIndex}` : ""}&PlaySessionId=play-${log.playbackInfo.length}&ApiKey=e2e-key&TranscodeReasons=${options.conversionReasons ?? "ContainerBitrateExceedsLimit"}${options.conversionQuery ?? ""}`,
            }],
          });
        }
        if (log.playbackInfo.length <= (options.noDirectPlayAnswers ?? 0)) {
          return json({ PlaySessionId: `play-${log.playbackInfo.length}`, MediaSources: [{ ...source, SupportsDirectPlay: false }] });
        }
        return json({ PlaySessionId: `play-${log.playbackInfo.length}`, MediaSources: [source] });
      case "/MediaSegments/movie-1":
        log.segmentRequests.push({ search: url.search, authorization: request.headers()["authorization"] });
        return json({ Items: options.segments ?? [], TotalRecordCount: (options.segments ?? []).length, StartIndex: 0 });
      case "/Videos/movie-1/stream":
        return route.fulfill({ status: 200, headers: cors, contentType: "video/mp4", body: "" });
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return log;
}

export async function openArrival(page: Page) {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  await page.getByRole("link", { name: "Arrival, 2016" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
}
