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
  disc?: boolean;
  // The first N PlaybackInfo answers say the server will not direct-play the file.
  noDirectPlayAnswers?: number;
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
        if (options.playbackDelayMs) await new Promise((resolve) => setTimeout(resolve, options.playbackDelayMs));
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
  expect(log.playbackInfo[0]).toMatchObject({
    MediaSourceId: "src-hd",
    StartTimeTicks: 0,
    EnableDirectPlay: true,
    EnableDirectStream: false,
    EnableTranscoding: false,
  });

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
  await expect(page.getByText("Browser — unverified")).toBeVisible();
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
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");

  await page.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));

  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible();
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing/Stopped");
});

test("Retry after a playback error renegotiates, and Back returns to the detail view", async ({ page }) => {
  const log = await mockPlayerServer(page, { failPlayback: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "Playback could not start" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(2);
  expect(log.playbackInfo[1]).toMatchObject({ MediaSourceId: "src-hd", EnableTranscoding: false });
  await expect.poll(() => (
    log.reports.filter((report) => report.path === "/Sessions/Playing/Stopped").map((report) => report.body.Failed)
  )).toContain(true);

  await page.getByRole("button", { name: "Back to library" }).last().click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible();
});

test("a Blu-ray folder is explained with Retry and Back and no way to play anyway", async ({ page }) => {
  const log = await mockPlayerServer(page, { disc: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  const heading = page.getByRole("heading", { name: "This is a disc folder" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("Blu-ray or DVD folder");
  await expect(page.getByRole("alert")).toContainText("Rip the disc to an MKV file");
  await expect(page.getByRole("button", { name: "Retry" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /anyway/i })).toHaveCount(0);
  await expect(page.getByText(/transcod/i)).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(log.reports).toHaveLength(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(2);
  await expect(heading).toBeVisible();
  expect(log.playbackInfo[1]).toMatchObject({ EnableTranscoding: false, EnableDirectStream: false });

  await page.getByRole("button", { name: "Back to details" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible();
});

test("a server that won't direct-play names the policy, and Retry plays once it is lifted", async ({ page }) => {
  const log = await mockPlayerServer(page, { noDirectPlayAnswers: 1 });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "The server won’t let Fluster play this file as it is" })).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("remote bitrate limit");
  await expect(page.getByRole("alert")).toContainText("Ask the server admin");
  await expect(page.getByRole("button", { name: /anyway/i })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(2);
  expect(log.playbackInfo[1]).toMatchObject({ MediaSourceId: "src-hd", EnableTranscoding: false });
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
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
