import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";

const source = {
  Id: "src-hd",
  Name: "1080p",
  Container: "mp4",
  Path: "/media/arrival.mp4",
  Protocol: "File",
  SupportsDirectPlay: true,
  MediaStreams: [{ Index: 0, Type: "Video", Codec: "h264", DisplayTitle: "H.264", IsExternal: false, IsDefault: true, IsForced: false }],
};

// 12 thumbnails, 10 s apart, 5 columns by 2 rows: tile 0 holds 0 to 99 s.
const trickplay = {
  "src-hd": { "320": { Width: 320, Height: 180, TileWidth: 5, TileHeight: 2, ThumbnailCount: 12, Interval: 10000 } },
};

const chapters = [
  { StartPositionTicks: 0, Name: "Opening" },
  { StartPositionTicks: 300_000_000, Name: "Contact" },
  { StartPositionTicks: 900_000_000, Name: "Departure" },
];

// A 1x1 PNG; the test checks where the tile is placed, not what it shows.
const tilePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

interface ServerLog {
  tileRequests: Array<{ url: string; authorization: string | undefined }>;
}

async function mockServer(page: Page, withTrickplay: boolean): Promise<ServerLog> {
  const log: ServerLog = { tileRequests: [] };

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
    if (url.pathname.startsWith("/Videos/movie-1/Trickplay/")) {
      log.tileRequests.push({ url: request.url(), authorization: request.headers()["authorization"] });
      return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: tilePng });
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
          ...(withTrickplay ? { Trickplay: trickplay, Chapters: chapters } : {}),
          UserData: { Played: false, IsFavorite: false, PlaybackPositionTicks: 0 },
        });
      case "/Items/movie-1/PlaybackInfo":
        return json({ PlaySessionId: "play-1", MediaSources: [source] });
      case "/Videos/movie-1/stream":
        // Left open: an empty answer would fail the real element after the stubbed first frame and replace the chrome.
        return new Promise<void>(() => undefined);
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return log;
}

async function playArrival(page: Page) {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  await page.getByRole("link", { name: "Arrival, 2016" }).click();
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/#\/next\/play\/movie-1/);
  await expect(page.getByRole("slider", { name: "Playback position" })).toBeEnabled();
}

test("hovering the seek bar shows the trickplay thumbnail and chapter, with chapter markers", async ({ page }) => {
  const log = await mockServer(page, true);
  await playArrival(page);

  await expect(page.getByRole("img", { name: "Chapter: Contact at 0:30" })).toBeAttached();
  await expect(page.getByRole("img", { name: "Chapter: Departure at 1:30" })).toBeAttached();
  await expect(page.getByRole("img", { name: /^Chapter: Opening/ })).toHaveCount(0);

  // Halfway is 60 s: thumbnail 6 of tile 0, which is column 1 of row 1.
  const track = page.locator(".seek-track");
  await track.hover({ position: { x: (await track.boundingBox())!.width / 2, y: 5 } });
  const thumbnail = page.getByRole("img", { name: /^Preview at / });
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).toHaveCSS("background-position", "-320px -180px");
  await expect(thumbnail).toHaveCSS("background-size", "1600px 360px");
  await expect(thumbnail).toHaveCSS("background-image", /^url\("blob:/);
  await expect(page.locator(".seek-preview")).toContainText("Contact");

  expect(log.tileRequests).toHaveLength(1);
  const [tile] = log.tileRequests;
  expect(new URL(tile.url).pathname).toBe("/Videos/movie-1/Trickplay/320/0.jpg");
  expect(new URL(tile.url).searchParams.get("mediaSourceId")).toBe("src-hd");
  expect(tile.url).not.toContain("test-token");
  expect(tile.authorization).toContain('Token="test-token"');

  await page.mouse.move(0, 0);
  await expect(page.locator(".seek-preview")).toHaveCount(0);
});

test("the seek bar stays plain when the item has no trickplay or chapters", async ({ page }) => {
  await mockServer(page, false);
  await playArrival(page);

  await expect(page.locator(".seek-track")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Playback position" })).toBeVisible();
});
