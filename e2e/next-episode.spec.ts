import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";

function source(id: string) {
  return {
    Id: `src-${id}`,
    Name: "1080p",
    Container: "mp4",
    Path: `/media/${id}.mp4`,
    Protocol: "File",
    SupportsDirectPlay: true,
    MediaStreams: [{ Index: 0, Type: "Video", Codec: "h264", DisplayTitle: "H.264", IsExternal: false, IsDefault: true, IsForced: false }],
  };
}

function episode(id: string, name: string, number: number) {
  return {
    Id: id,
    Name: name,
    Type: "Episode",
    SeriesId: "series-1",
    SeriesName: "Show",
    ParentIndexNumber: 1,
    IndexNumber: number,
    RunTimeTicks: 250_000_000,
    MediaSources: [source(id)],
    UserData: { Played: false, IsFavorite: false, PlaybackPositionTicks: 0 },
  };
}

interface ServerLog {
  playbackInfo: Array<{ itemId: string; body: Record<string, unknown> }>;
  stopped: Array<Record<string, unknown>>;
  nextLookups: string[];
}

// Mocks a series of two episodes. The clip is 25 s long, so it is inside the
// 30 s end window from the start.
async function mockServer(page: Page): Promise<ServerLog> {
  const log: ServerLog = { playbackInfo: [], stopped: [], nextLookups: [] };

  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 25 });
    HTMLMediaElement.prototype.play = function play() {
      queueMicrotask(() => {
        this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("playing"));
      });
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event("pause"));
    };
    HTMLMediaElement.prototype.load = () => undefined;
    // The stubbed play() never starts a clock, so report the clip as playing.
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => false });
    // No media is fetched, so the empty mock stream cannot raise an error event.
    Object.defineProperty(HTMLMediaElement.prototype, "src", { configurable: true, get: () => "", set: () => undefined });
  });

  await page.route(`${serverUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    const json = (body: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/Sessions/Playing/Stopped") {
      log.stopped.push(request.postDataJSON());
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname.startsWith("/Sessions/Playing")) return route.fulfill({ status: 204, headers: cors });
    const playbackInfo = /^\/Items\/(ep-\d)\/PlaybackInfo$/.exec(url.pathname);
    if (playbackInfo) {
      const id = playbackInfo[1];
      log.playbackInfo.push({ itemId: id, body: request.postDataJSON() });
      return json({ PlaySessionId: `play-${id}-${log.playbackInfo.length}`, MediaSources: [source(id)] });
    }
    if (/^\/Videos\/ep-\d\/stream$/.test(url.pathname)) {
      return route.fulfill({ status: 200, headers: cors, contentType: "video/mp4", body: "" });
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
        return json({ Items: [{ Id: "lib-1", Name: "Shows", CollectionType: "tvshows" }] });
      case "/UserItems/Resume":
      case "/Shows/NextUp":
      case "/Items/Latest":
        return json(url.pathname === "/Items/Latest" ? [] : { Items: [] });
      case "/Items/ep-1":
        return json(episode("ep-1", "Pilot", 1));
      case "/Items/ep-2":
        return json(episode("ep-2", "Second", 2));
      case "/Shows/series-1/Episodes":
        log.nextLookups.push(url.searchParams.get("adjacentTo") ?? "");
        return json({ Items: [episode("ep-1", "Pilot", 1), episode("ep-2", "Second", 2)] });
      case "/Shows/series-1/Seasons":
        return json({ Items: [{ Id: "season-1", Name: "Season 1", Type: "Season", IndexNumber: 1 }] });
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return log;
}

async function playFirstEpisode(page: Page) {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  await page.evaluate(() => { window.location.hash = "#/next/play/ep-1"; });
  await expect(page.getByRole("heading", { name: "Pilot", level: 1 })).toBeVisible();
}

test("the countdown near the end of an episode starts the next one with a fresh play session", async ({ page }) => {
  test.setTimeout(45_000);
  const log = await mockServer(page);
  await playFirstEpisode(page);

  const card = page.getByLabel("Up next");
  await expect(card).toContainText("S1E2 Second");
  await expect(card.getByRole("status")).toContainText(/Playing in \d+ s/);
  // StrictMode may repeat the lookup in dev; it is always for the episode playing.
  expect(new Set(log.nextLookups)).toEqual(new Set(["ep-1"]));

  await expect(page).toHaveURL(/#\/next\/play\/ep-2$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Second", level: 1 })).toBeVisible();
  expect(log.playbackInfo.map((entry) => entry.itemId)).toEqual(["ep-1", "ep-2"]);
  expect(log.playbackInfo[1].body).toMatchObject({
    EnableDirectPlay: true,
    EnableDirectStream: false,
    EnableTranscoding: false,
  });
  await expect.poll(() => log.stopped.length).toBeGreaterThanOrEqual(1);
  expect(log.stopped[0]).toMatchObject({ PlaySessionId: "play-ep-1-1", Failed: false });
});

test("Cancel stops the episode and returns to the series", async ({ page }) => {
  const log = await mockServer(page);
  await playFirstEpisode(page);

  await page.getByLabel("Up next").getByRole("button", { name: "Cancel" }).click();

  await expect(page).toHaveURL(/#\/next\/series\/series-1$/);
  await expect(page.getByRole("button", { name: "Season 1" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await expect.poll(() => log.stopped.length).toBe(1);
  expect(log.stopped[0]).toMatchObject({ PlaySessionId: "play-ep-1-1" });
  expect(log.playbackInfo.map((entry) => entry.itemId)).toEqual(["ep-1"]);
});
