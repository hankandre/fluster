import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";
const NO_LIMIT = 1_000_000_000;

interface Log {
  playbackInfo: Array<Record<string, unknown>>;
  playbackInfoQueries: URLSearchParams[];
}

// One movie with a direct-play source. The server is loopback, so the local
// limit applies to it.
async function mockServer(page: Page): Promise<Log> {
  const log: Log = { playbackInfo: [], playbackInfoQueries: [] };
  const source = {
    Id: "src-hd",
    Name: "1080p",
    Container: "mp4",
    Path: "/media/arrival.mp4",
    Protocol: "File",
    SupportsDirectPlay: true,
    MediaStreams: [{ Index: 0, Type: "Video", Codec: "h264", DisplayTitle: "H.264", IsExternal: false, IsDefault: true, IsForced: false }],
  };
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 120 });
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
    if (url.pathname.startsWith("/Sessions/Playing")) return route.fulfill({ status: 204, headers: cors });
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
          Id: "movie-1", Name: "Arrival", Type: "Movie", ProductionYear: 2016, RunTimeTicks: 1_200_000_000,
          MediaSources: [source], UserData: { Played: false, IsFavorite: false, PlaybackPositionTicks: 0 },
        });
      case "/Items/movie-1/PlaybackInfo":
        log.playbackInfo.push(request.postDataJSON());
        log.playbackInfoQueries.push(url.searchParams);
        return json({ PlaySessionId: `play-${log.playbackInfo.length}`, MediaSources: [source] });
      case "/MediaSegments/movie-1":
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
      case "/Videos/movie-1/stream":
        return route.fulfill({ status: 200, headers: cors, contentType: "video/mp4", body: "" });
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return log;
}

async function signIn(page: Page) {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
}

async function playArrival(page: Page) {
  await page.getByRole("link", { name: "Arrival, 2016" }).click();
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
}

test("streaming limits default to no limit, apply by host class, and persist", async ({ page }) => {
  const log = await mockServer(page);
  await signIn(page);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/#\/next\/settings$/);
  const local = page.getByLabel("Local network maximum bitrate");
  const remote = page.getByLabel("Remote maximum bitrate");
  await expect(local).toHaveValue("none");
  await expect(remote).toHaveValue("none");

  // The remote limit does not apply to a loopback server.
  await remote.selectOption("4");
  await page.getByRole("link", { name: "Home" }).click();
  await playArrival(page);
  expect(log.playbackInfo[0].MaxStreamingBitrate).toBe(NO_LIMIT);
  expect(log.playbackInfoQueries[0].get("MaxStreamingBitrate")).toBe(String(NO_LIMIT));

  // The local limit does, in the body and the query, and survives a reload.
  await page.goto("/#/next/settings");
  await local.focus();
  await local.selectOption("20");
  await page.reload();
  // The session is memory only, so sign in again; the limits come back.
  await signIn(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByLabel("Local network maximum bitrate")).toHaveValue("20");
  await expect(page.getByLabel("Remote maximum bitrate")).toHaveValue("4");
  await page.getByRole("link", { name: "Home" }).click();
  await playArrival(page);
  const last = log.playbackInfo.length - 1;
  expect(last).toBeGreaterThan(0);
  expect(log.playbackInfo[last].MaxStreamingBitrate).toBe(20_000_000);
  expect(log.playbackInfoQueries[last].get("MaxStreamingBitrate")).toBe("20000000");

  // Only two numbers are stored, never a token.
  const stored = await page.evaluate(() => window.localStorage.getItem("fluster.streamingLimits"));
  expect(JSON.parse(stored!)).toEqual({ version: 1, localMbps: 20, remoteMbps: 4 });
});
