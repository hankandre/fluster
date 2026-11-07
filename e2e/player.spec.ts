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
  failPlayback?: boolean;
}

interface ServerLog {
  playbackInfo: Array<Record<string, unknown>>;
  reports: Array<{ path: string; body: Record<string, unknown> }>;
}

// Mocks a server with one movie and the original-file playback endpoints.
async function mockPlayerServer(page: Page, options: ServerOptions = {}): Promise<ServerLog> {
  const log: ServerLog = { playbackInfo: [], reports: [] };
  const source = options.disc ? discSource : fileSource;

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

  await page.route(`${serverUrl}/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    const json = (body: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.startsWith("/Sessions/Playing")) {
      log.reports.push({ path: url.pathname, body: request.postDataJSON() });
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
        return json({ PlaySessionId: `play-${log.playbackInfo.length}`, MediaSources: [source] });
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
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing/Stopped");
  const stopped = log.reports.find((report) => report.path === "/Sessions/Playing/Stopped");
  expect(stopped?.body).toMatchObject({ Failed: false, PlaySessionId: "play-1", MediaSourceId: "src-hd" });
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

test("a Blu-ray folder shows the refusal with Back and no way to play anyway", async ({ page }) => {
  const log = await mockPlayerServer(page, { disc: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "This item can’t be played" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Blu-ray or DVD folder");
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(log.reports).toHaveLength(0);

  await page.getByRole("button", { name: "Back to details" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 2 })).toBeVisible();
});
