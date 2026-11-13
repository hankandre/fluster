import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";
const NO_LIMIT = 1_000_000_000;

interface Log {
  playbackInfo: Array<Record<string, unknown>>;
  playbackInfoQueries: URLSearchParams[];
  logouts: number;
}

// One movie with a direct-play source. The server is loopback, so the local
// limit applies to it.
async function mockServer(page: Page): Promise<Log> {
  const log: Log = { playbackInfo: [], playbackInfoQueries: [], logouts: 0 };
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
    if (url.pathname === "/Sessions/Logout") {
      log.logouts += 1;
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
        // Left open: an empty answer would fail the real element after the stubbed first frame and replace the chrome.
        return new Promise<void>(() => undefined);
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

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/#\/next\/settings$/);
  const local = page.getByRole("button", { name: /^Local network maximum bitrate/ });
  const remote = page.getByRole("button", { name: /^Remote maximum bitrate/ });
  await expect(local).toHaveText("No limit");
  await expect(remote).toHaveText("No limit");

  // The remote limit does not apply to a loopback server.
  await remote.click();
  await page.getByRole("option", { name: "4 Mbps", exact: true }).click();
  await expect(page.getByText("Remote limit set to 4 Mbps.")).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await playArrival(page);
  expect(log.playbackInfo[0].MaxStreamingBitrate).toBe(NO_LIMIT);
  expect(log.playbackInfoQueries[0].get("MaxStreamingBitrate")).toBe(String(NO_LIMIT));

  // The local limit does, in the body and the query, and survives a reload.
  // The player has no nav: leave it by its Back control, then use the nav.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/#\/next\/item\//);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/#\/next\/settings$/);
  await local.focus();
  await page.keyboard.press("Enter");
  const twenty = page.getByRole("option", { name: "20 Mbps", exact: true });
  for (let presses = 0; presses < 9 && !(await twenty.evaluate((node) => node === document.activeElement)); presses += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(twenty).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(local).toHaveText("20 Mbps");
  await page.reload();
  // The session is memory only, so sign in again; the limits come back.
  await signIn(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("button", { name: /^Local network maximum bitrate/ })).toHaveText("20 Mbps");
  await expect(page.getByRole("button", { name: /^Remote maximum bitrate/ })).toHaveText("4 Mbps");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await playArrival(page);
  const last = log.playbackInfo.length - 1;
  expect(last).toBeGreaterThan(0);
  expect(log.playbackInfo[last].MaxStreamingBitrate).toBe(20_000_000);
  expect(log.playbackInfoQueries[last].get("MaxStreamingBitrate")).toBe("20000000");

  // Only two numbers are stored, never a token.
  const stored = await page.evaluate(() => window.localStorage.getItem("fluster.streamingLimits"));
  expect(JSON.parse(stored!)).toEqual({ version: 1, localMbps: 20, remoteMbps: 4 });
});

async function openSettings(page: Page) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/#\/next\/settings$/);
}

test("Settings sections work with the keyboard alone", async ({ page }) => {
  await mockServer(page);
  await signIn(page);
  await openSettings(page);

  const playback = page.getByRole("tab", { name: "Playback" });
  await playback.focus();
  for (const name of ["Subtitles", "Account", "About & diagnostics"]) {
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("tab", { name })).toBeFocused();
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await page.keyboard.press("Home");
  await expect(page.getByRole("heading", { level: 2, name: "Playback" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /^Local network maximum bitrate/ })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(playback).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/settings$/);
});

test("Sign out returns to sign-in with a Signed out toast", async ({ page }) => {
  const log = await mockServer(page);
  await signIn(page);
  await openSettings(page);
  await page.getByRole("tab", { name: "Account" }).click();
  await expect(page.getByText("Testfin")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/#\/next\/sign-in$/);
  await expect(page.getByText("Signed out")).toBeVisible();
  await expect.poll(() => log.logouts).toBe(1);
});

test("Copy diagnostics holds versions and no server identity", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockServer(page);
  await signIn(page);
  await openSettings(page);
  await page.getByRole("tab", { name: "About & diagnostics" }).click();
  await expect(page.getByText("Browser (development)")).toBeVisible();
  await expect(page.getByText("10.11.7")).toBeVisible();
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Diagnostics copied")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  for (const part of ["Fluster 0.1.0", "Jellyfin: 10.11.7", "Server: local network", "Player: browser (development)"]) {
    expect(copied).toContain(part);
  }
  expect(copied.split("\n")).toHaveLength(7);
  for (const secret of ["127.0.0.1", "Testfin", "Tester", "test-token", "play-"]) expect(copied).not.toContain(secret);
});
