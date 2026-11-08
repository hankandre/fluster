import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";

const fileSource = {
  Id: "src-hd",
  Name: "1080p",
  Container: "mp4",
  Path: "/media/arrival.mp4",
  Protocol: "File",
  SupportsDirectPlay: true,
  MediaStreams: [{ Index: 0, Type: "Video", Codec: "h264", DisplayTitle: "H.264", IsExternal: false, IsDefault: true, IsForced: false }],
};

const discSource = {
  Id: "src-disc",
  Name: "Blu-ray",
  Path: "/media/Disc/BDMV",
  Protocol: "File",
  VideoType: "BluRay",
  SupportsDirectPlay: true,
  MediaStreams: [],
};

interface ServerOptions {
  resumeTicks?: number;
  // The server offers the disc for direct play; the forced-fallback request
  // (EnableDirectPlay false) gets neither direct play nor a conversion.
  disc?: boolean;
  // The first N PlaybackInfo answers offer neither direct play nor a conversion.
  noDirectPlayAnswers?: number;
  // Every PlaybackInfo answer is an HLS conversion instead of direct play.
  converted?: boolean;
  failPlayback?: boolean;
  playbackDelayMs?: number;
  // Playstate reports are logged on arrival but answered only after releaseReports().
  holdReports?: boolean;
  // The PlaybackInfo source reports HasSegments, and the segments endpoint answers with these items.
  segments?: Array<Record<string, unknown>>;
  hasSegments?: boolean;
}

interface ServerLog {
  playbackInfo: Array<Record<string, unknown>>;
  playbackInfoQueries: URLSearchParams[];
  reports: Array<{ path: string; body: Record<string, unknown> }>;
  segmentRequests: Array<{ search: string; authorization: string | undefined }>;
  requestUrls: string[];
  releaseReports(): void;
}

// Mocks a server with one movie and the original-file playback endpoints.
async function mockPlayerServer(page: Page, options: ServerOptions = {}): Promise<ServerLog> {
  let releaseReports = () => undefined as void;
  const reportGate = new Promise<void>((resolve) => { releaseReports = resolve; });
  const log: ServerLog = {
    playbackInfo: [],
    playbackInfoQueries: [],
    reports: [],
    segmentRequests: [],
    requestUrls: [],
    releaseReports: () => releaseReports(),
  };
  const source = { ...(options.disc ? discSource : fileSource), HasSegments: options.hasSegments ?? false };

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
      log.reports.push({ path: url.pathname, body: request.postDataJSON() });
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
      case "/Items/movie-1/PlaybackInfo":
        log.playbackInfo.push(request.postDataJSON());
        log.playbackInfoQueries.push(url.searchParams);
        if (options.playbackDelayMs) await new Promise((resolve) => setTimeout(resolve, options.playbackDelayMs));
        if (options.disc && url.searchParams.get("EnableDirectPlay") === "false") {
          return json({ PlaySessionId: `play-${log.playbackInfo.length}`, MediaSources: [{ ...source, SupportsDirectPlay: false }] });
        }
        if (options.converted) {
          return json({
            PlaySessionId: `play-${log.playbackInfo.length}`,
            MediaSources: [{
              ...source,
              SupportsDirectPlay: false,
              TranscodingSubProtocol: "hls",
              TranscodingUrl: `/videos/movie-1/master.m3u8?MediaSourceId=${source.Id}&VideoCodec=h264&AudioCodec=aac&PlaySessionId=play-${log.playbackInfo.length}&ApiKey=e2e-key&TranscodeReasons=ContainerBitrateExceedsLimit`,
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

async function openArrival(page: Page) {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  await page.getByRole("link", { name: "Arrival, 2016" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
}

// The decision 0002 flags, in the body and in the query string. EnableDirectPlay
// is false only on the forced-fallback request for a disc.
function expectFallbackFlags(log: ServerLog, index: number, enableDirectPlay = true) {
  const flags = {
    EnableDirectPlay: enableDirectPlay,
    EnableDirectStream: true,
    EnableTranscoding: true,
    AllowVideoStreamCopy: true,
    AllowAudioStreamCopy: true,
    AutoOpenLiveStream: false,
  };
  expect(log.playbackInfo[index]).toMatchObject({ ...flags, AlwaysBurnInSubtitleWhenTranscoding: false });
  const query = log.playbackInfoQueries[index];
  for (const [name, value] of Object.entries(flags)) expect(query.get(name), name).toBe(String(value));
}

function reportPaths(log: ServerLog): string[] {
  return log.reports.map((report) => report.path);
}

test("Play opens the player and Back returns to the detail view", async ({ page }) => {
  const log = await mockPlayerServer(page);
  await openArrival(page);

  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/#\/next\/play\/movie-1\?source=src-hd$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");
  expect(log.playbackInfo).toHaveLength(1);
  expect(log.playbackInfo[0]).toMatchObject({ MediaSourceId: "src-hd", StartTimeTicks: 0 });
  expectFallbackFlags(log, 0);

  await page.getByLabel("Back to library").click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  // Back went back through history instead of adding a second detail entry.
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing/Stopped");
  const stopped = log.reports.find((report) => report.path === "/Sessions/Playing/Stopped");
  expect(stopped?.body).toMatchObject({ Failed: false, PlaySessionId: "play-1", MediaSourceId: "src-hd" });
});

test("Back does not wait for a slow Jellyfin progress report, and Stopped is still sent", async ({ page }) => {
  const log = await mockPlayerServer(page, { holdReports: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");

  await page.getByLabel("Back to library").click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/, { timeout: 1_000 });
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible({ timeout: 1_000 });
  expect(reportPaths(log)).not.toContain("/Sessions/Playing/Stopped");

  log.releaseReports();
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing/Stopped");
});

test("never puts a token in a request URL, including the stream", async ({ page }) => {
  const log = await mockPlayerServer(page);
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.locator(".player-diagnostics").getByText("Browser — unverified")).toBeVisible();
  await expect.poll(() => log.requestUrls.some((url) => new URL(url).pathname === "/Videos/movie-1/stream")).toBe(true);
  expect(log.requestUrls.filter((url) => /api_?key|access_token|token/i.test(url))).toEqual([]);
});

test("Resume starts at the saved position and the end of the file returns to the detail view", async ({ page }) => {
  const log = await mockPlayerServer(page, { resumeTicks: 7_540_000_000 });
  await openArrival(page);

  await expect(page.getByRole("link", { name: "Start over" })).toBeVisible();
  await page.getByRole("link", { name: "Resume from 12:34" }).click();
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await expect.poll(() => log.playbackInfo.length).toBe(1);
  expect(log.playbackInfo[0]).toMatchObject({ StartTimeTicks: 7_540_000_000, MediaSourceId: "src-hd" });
  expectFallbackFlags(log, 0);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");

  await page.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));

  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible();
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing/Stopped");
});

test("Retry after a playback error renegotiates, and Back returns to the detail view", async ({ page }) => {
  const log = await mockPlayerServer(page, { failPlayback: true, resumeTicks: 4_200_000_000 });
  await openArrival(page);

  await page.getByRole("link", { name: "Resume from 7:00" }).click();
  await expect(page.getByRole("heading", { name: "Playback could not start" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(2);
  expect(log.playbackInfo[0]).toMatchObject({ StartTimeTicks: 4_200_000_000 });
  expect(log.playbackInfo[1]).toMatchObject({ StartTimeTicks: 4_200_000_000 });
  expectFallbackFlags(log, 0);
  expectFallbackFlags(log, 1);
  expect(log.playbackInfo[1]).toMatchObject({ MediaSourceId: "src-hd" });
  await expect.poll(() => (
    log.reports.filter((report) => report.path === "/Sessions/Playing/Stopped").map((report) => report.body.Failed)
  )).toContain(true);

  await page.getByRole("button", { name: "Back to library" }).last().click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible();
});

test("a Blu-ray folder offered for direct play is asked for once more without it, then explained", async ({ page }) => {
  const log = await mockPlayerServer(page, { disc: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  const heading = page.getByRole("heading", { name: "This file needs converting, and the server doesn’t allow that for your account" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("Ask the server admin");
  await expect(page.getByRole("button", { name: "Retry" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /anyway/i })).toHaveCount(0);
  await expect(page.getByText(/transcod/i)).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(log.reports).toHaveLength(0);
  // The disc is never requested as a static file.
  expect(log.requestUrls.filter((url) => /\/stream|Static=true/i.test(url))).toEqual([]);
  expect(log.playbackInfo).toHaveLength(2);
  expectFallbackFlags(log, 0);
  expectFallbackFlags(log, 1, false);
  expect(log.playbackInfo[1]).toMatchObject({ MediaSourceId: "src-disc" });

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(4);
  await expect(heading).toBeVisible();
  expectFallbackFlags(log, 3, false);

  await page.getByRole("button", { name: "Back to details" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible();
});

test("a server that won't convert for this account names the setting, and Retry plays once it is lifted", async ({ page }) => {
  const log = await mockPlayerServer(page, { noDirectPlayAnswers: 1 });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "This file needs converting, and the server doesn’t allow that for your account" })).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("Ask the server admin");
  await expect(page.getByRole("button", { name: /anyway/i })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(2);
  expect(log.playbackInfo[1]).toMatchObject({ MediaSourceId: "src-hd" });
  expectFallbackFlags(log, 1);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
});

// Decision 0002: the browser development engine never plays HLS (I7); P10-10
// owns the final view for this case.
test("a converted stream is not played by the browser engine and never requested", async ({ page }) => {
  const log = await mockPlayerServer(page, { converted: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByText("This stream needs the desktop player.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  expect(log.requestUrls.filter((url) => /m3u8|e2e-key/i.test(url))).toEqual([]);
});

test("Back cancels an in-flight playback negotiation", async ({ page }) => {
  const log = await mockPlayerServer(page, { playbackDelayMs: 300 });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(1);
  await page.getByLabel("Back to library").click();

  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await page.waitForTimeout(450);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(log.playbackInfo).toHaveLength(1);
  expect(log.reports).toHaveLength(0);
});

const introAndOutro = [
  { Id: "seg-1", Type: "Intro", StartTicks: 100_000_000, EndTicks: 700_000_000 },
  { Id: "seg-2", Type: "Outro", StartTicks: 1_000_000_000, EndTicks: 1_190_000_000 },
];

async function moveTo(page: Page, seconds: number) {
  await page.locator("video").evaluate((video: HTMLVideoElement, position) => {
    video.currentTime = position;
    video.dispatchEvent(new Event("timeupdate"));
  }, seconds);
}

test("skip buttons appear inside the intro and the credits and seek to the segment end", async ({ page }) => {
  const log = await mockPlayerServer(page, { hasSegments: true, segments: introAndOutro });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);

  await expect.poll(() => log.segmentRequests.length).toBe(1);
  expect(log.segmentRequests[0].search).toBe("?includeSegmentTypes=Intro&includeSegmentTypes=Outro");
  expect(log.segmentRequests[0].authorization).toMatch(/^MediaBrowser /);

  await moveTo(page, 5);
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);

  await moveTo(page, 30);
  const skipIntro = page.getByRole("button", { name: "Skip intro" });
  await expect(skipIntro).toBeVisible();
  await expect(skipIntro).not.toBeFocused();
  await skipIntro.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(70);
  // A real media element reports the new position itself; the stub does not.
  await page.locator("video").dispatchEvent("timeupdate");
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);

  await moveTo(page, 105);
  await expect(page.getByRole("button", { name: "Skip credits" })).toBeVisible();
  await moveTo(page, 118.5);
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);
});

test("a version without segments never asks for them and shows no skip button", async ({ page }) => {
  const log = await mockPlayerServer(page, { hasSegments: false, segments: introAndOutro });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");

  await moveTo(page, 30);
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);
  expect(log.segmentRequests).toHaveLength(0);
});

test("empty segment data hides the skip feature", async ({ page }) => {
  const log = await mockPlayerServer(page, { hasSegments: true, segments: [] });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect.poll(() => log.segmentRequests.length).toBe(1);

  await moveTo(page, 30);
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);
});

test("the Info panel toggles with its button and the i key and shows no ids or URLs", async ({ page }) => {
  await mockPlayerServer(page);
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);

  const button = page.getByRole("button", { name: "Info" });
  const panel = page.getByLabel("Player information");
  await expect(panel).toBeHidden();
  await button.click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Browser — unverified");
  await expect(panel).toContainText("Direct play");
  const text = (await panel.textContent()) ?? "";
  expect(text).not.toContain("play-1");
  expect(text).not.toContain("://");
  expect(text).not.toContain("src-hd");

  await page.locator("body").press("i");
  await expect(panel).toBeHidden();
  await page.locator("body").press("i");
  await expect(panel).toBeVisible();
});
