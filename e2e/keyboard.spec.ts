import { expect, test, type Locator, type Page } from "@playwright/test";

// The whole journey uses the keyboard alone: no click, no mouse movement.

const serverUrl = "http://127.0.0.1:8096";

const source = {
  Id: "src-hd",
  Name: "1080p",
  Container: "mp4",
  Path: "/media/arrival.mp4",
  Protocol: "File",
  SupportsDirectPlay: true,
  HasSegments: false,
  MediaStreams: [{ Index: 0, Type: "Video", Codec: "h264", DisplayTitle: "H.264", IsExternal: false, IsDefault: true, IsForced: false }],
};

async function mockServer(page: Page): Promise<string[]> {
  const reports: string[] = [];

  // A file-less <video>: play and pause flip a paused flag and fire the events
  // the browser engine listens to.
  await page.addInitScript(() => {
    const paused = new WeakMap<HTMLMediaElement, boolean>();
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 120 });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get(this: HTMLMediaElement) {
        return paused.get(this) ?? true;
      },
    });
    HTMLMediaElement.prototype.play = function play() {
      const first = !paused.has(this);
      paused.set(this, false);
      queueMicrotask(() => {
        if (first) this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("play"));
        this.dispatchEvent(new Event("playing"));
      });
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      paused.set(this, true);
      this.dispatchEvent(new Event("pause"));
    };
    HTMLMediaElement.prototype.load = () => undefined;
    // The empty stream body cannot decode; keep that error from the engine.
    window.addEventListener("error", (event) => {
      if (event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
    }, true);
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
    if (url.pathname.startsWith("/Sessions/Playing")) {
      reports.push(url.pathname);
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
        return json([
          { Id: "movie-0", Name: "Annihilation", Type: "Movie", ProductionYear: 2018 },
          { Id: "movie-1", Name: "Arrival", Type: "Movie", ProductionYear: 2016 },
        ]);
      case "/Items/movie-1":
        return json({
          Id: "movie-1",
          Name: "Arrival",
          Type: "Movie",
          ProductionYear: 2016,
          RunTimeTicks: 1_200_000_000,
          MediaSources: [source],
          UserData: { Played: false, IsFavorite: false, PlaybackPositionTicks: 0 },
        });
      case "/Items/movie-1/PlaybackInfo":
        return json({ PlaySessionId: "play-1", MediaSources: [source] });
      case "/MediaSegments/movie-1":
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
      case "/Videos/movie-1/stream":
        return route.fulfill({ status: 200, headers: cors, contentType: "video/mp4", body: "" });
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return reports;
}

// Presses Tab until `target` has focus, as a keyboard user would.
async function tabTo(page: Page, target: Locator, maxPresses = 40): Promise<void> {
  for (let press = 0; press < maxPresses; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

const video = (page: Page) => page.locator("video");

test("signs in, opens an item, plays, pauses, seeks, and leaves with the keyboard alone", async ({ page }) => {
  const reports = await mockServer(page);

  await page.goto("/#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.keyboard.type(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });

  // The row is one Tab stop; the arrow keys move inside it.
  const annihilation = page.getByRole("link", { name: "Annihilation, 2018" });
  await tabTo(page, annihilation);
  await page.keyboard.press("ArrowRight");
  const arrival = page.getByRole("link", { name: "Arrival, 2016" });
  await expect(arrival).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  // Wait for the detail page, so Home's hero Play link is gone before tabbing.
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();

  const play = page.getByRole("link", { name: "Play" });
  await tabTo(page, play);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/movie-1\?source=src-hd$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await expect.poll(() => reports).toContain("/Sessions/Playing");
  await expect.poll(() => video(page).evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);

  await page.keyboard.press("k");
  await expect.poll(() => video(page).evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await page.keyboard.press("Space");
  await expect.poll(() => video(page).evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => video(page).evaluate((element: HTMLVideoElement) => element.currentTime)).toBe(10);

  await page.keyboard.press("ArrowDown");
  await expect.poll(() => video(page).evaluate((element: HTMLVideoElement) => element.volume)).toBeCloseTo(0.95);
  await page.keyboard.press("m");
  await expect.poll(() => video(page).evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);

  // Tabbing into the player reaches its controls.
  const back = page.getByRole("button", { name: "Back", exact: true });
  await tabTo(page, back);
  await expect(back).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await expect(video(page)).toHaveCount(0);
  await expect.poll(() => reports).toContain("/Sessions/Playing/Stopped");
});
