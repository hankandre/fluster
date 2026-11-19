import { expect, test, type Page } from "@playwright/test";
import { installMockServer } from "./support/mock-server";

const serverUrl = "http://127.0.0.1:8096";

const stream = (extra: Record<string, unknown>) => ({ IsExternal: false, IsDefault: false, IsForced: false, ...extra });

const hdrSource = {
  Id: "src-4k",
  Name: "4K HDR",
  Container: "mkv",
  Size: 12 * 1024 ** 3,
  MediaStreams: [
    stream({ Index: 0, Type: "Video", Codec: "hevc", Profile: "Main 10", Width: 3840, Height: 2160, BitDepth: 10, VideoRange: "HDR", VideoRangeType: "HDR10" }),
    stream({ Index: 1, Type: "Audio", Codec: "eac3", Language: "eng", Channels: 6, IsDefault: true }),
    stream({ Index: 2, Type: "Subtitle", Codec: "subrip", Language: "eng", IsDefault: true }),
    stream({ Index: 3, Type: "Subtitle", Codec: "pgssub", Language: "fra", IsExternal: true }),
  ],
};

const sdrSource = {
  Id: "src-hd",
  Name: "1080p",
  Container: "mp4",
  MediaStreams: [
    stream({ Index: 0, Type: "Video", Codec: "h264", Width: 1920, Height: 1080, BitDepth: 8, VideoRange: "SDR", VideoRangeType: "SDR" }),
    stream({ Index: 1, Type: "Audio", Codec: "aac", Language: "eng", Channels: 2, IsDefault: true }),
  ],
};

// Mocks a server with one movie that has two versions. Played and favorite
// requests are recorded and change what the item reports next.
async function mockDetailServer(page: Page) {
  const writes: string[] = [];
  let favorite = false;
  let played = false;
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
    if (url.pathname.startsWith("/UserFavoriteItems/")) {
      writes.push(`${request.method()} ${url.pathname}`);
      favorite = request.method() === "POST";
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" });
    }
    if (url.pathname.startsWith("/UserPlayedItems/")) {
      writes.push(`${request.method()} ${url.pathname}`);
      played = request.method() === "POST";
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" });
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
          Overview: "A linguist meets visitors.",
          Genres: ["Sci-Fi"],
          MediaSources: [hdrSource, sdrSource],
          UserData: { Played: played, IsFavorite: favorite, PlaybackPositionTicks: 0 },
        });
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return writes;
}

test("open a movie, read its media info, switch version, and favorite it", async ({ page }) => {
  const writes = await mockDetailServer(page);

  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });

  await page.getByRole("link", { name: "Arrival, 2016" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Arrival" })).toBeVisible();

  const hdrInfo = page.getByRole("region", { name: "Media info for 4K HDR" });
  await expect(hdrInfo.getByText("HEVC · Main 10 · 3840×2160 · 10-bit")).toBeVisible();
  await expect(hdrInfo.getByText("HDR10", { exact: true })).toBeVisible();
  await expect(hdrInfo.getByText("English · E-AC-3 5.1 · default")).toBeVisible();
  await expect(hdrInfo.getByText("English · SRT · default")).toBeVisible();
  await hdrInfo.getByRole("button", { name: "Show all 2 subtitles" }).click();
  await expect(hdrInfo.getByText("French · PGS · external")).toBeVisible();

  await page.getByRole("button", { name: /^Version/ }).click();
  await page.getByRole("option", { name: /^1080p/ }).click();
  const sdrInfo = page.getByRole("region", { name: "Media info for 1080p" });
  await expect(sdrInfo.getByText("H.264 · 1920×1080 · 8-bit")).toBeVisible();
  await expect(sdrInfo.getByText("SDR", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Play", exact: true })).toHaveAttribute("href", /\?source=src-hd$/);

  const toast = page.locator(".ui-toast-region").getByRole("status");
  const watched = page.getByRole("button", { name: "Watched" });
  await watched.click();
  await expect(toast).toContainText("Marked as watched.");
  await expect(watched).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => writes).toEqual(["POST /UserPlayedItems/movie-1"]);
  await watched.click();
  await expect(toast).toContainText("Marked as unwatched.");
  await expect(watched).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => writes).toEqual(["POST /UserPlayedItems/movie-1", "DELETE /UserPlayedItems/movie-1"]);
  writes.length = 0;

  const favorite = page.getByRole("button", { name: "Favorite" });
  await favorite.click();
  await expect(toast).toContainText("Added to favorites.");
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => writes).toEqual(["POST /UserFavoriteItems/movie-1"]);

  await favorite.click();
  await expect(toast).toContainText("Removed from favorites.");
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => writes).toEqual(["POST /UserFavoriteItems/movie-1", "DELETE /UserFavoriteItems/movie-1"]);
});

async function signIn(page: Page, hash: string) {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  await page.evaluate((target) => { window.location.hash = target; }, hash);
}

test("an episode links to its series and lists the season's other episodes", async ({ page }) => {
  await installMockServer(page);
  await signIn(page, "#/next/item/ep-2");

  await expect(page.getByRole("heading", { level: 1, name: "The Keeper's Log" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Harbor Lights" })).toHaveAttribute("href", "#/next/series/s1");

  const strip = page.getByRole("region", { name: "More from Season 1" });
  await expect(strip.getByRole("link", { name: /Landfall/ })).toBeVisible();
  await expect(strip.getByRole("link", { name: /Fog Signal/ })).toBeVisible();
  await expect(strip.getByRole("link", { name: /The Keeper's Log/ })).toHaveCount(0);

  // Down from the action bar reaches the strip; the overview's "More" row may come first.
  await page.getByRole("link", { name: /^Resume from/ }).focus();
  for (let press = 0; press < 2; press += 1) {
    await page.keyboard.press("ArrowDown");
    const inStrip = await page.evaluate(() => Boolean(document.activeElement?.closest(".media-row")));
    if (inStrip) break;
  }
  await expect(strip.locator(":focus")).toHaveCount(1);

  await strip.getByRole("link", { name: /Fog Signal/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/ep-3$/);
  await expect(page.getByRole("heading", { level: 1, name: "Fog Signal" })).toBeVisible();
});

test("a missing item shows a notice with Go home", async ({ page }) => {
  await installMockServer(page);
  await signIn(page, "#/next/item/nope");

  const heading = page.getByRole("heading", { level: 1, name: "This item is no longer on the server" });
  await expect(heading).toBeFocused();
  await page.getByRole("link", { name: "Go home" }).click();
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("the facts line shows the ratings and the cast shows pictures with initials as the fallback", async ({ page }) => {
  await installMockServer(page);
  await signIn(page, "#/next/item/m1");

  await expect(page.locator(".detail-facts")).toContainText("7.8 audience · 91% critics");
  const cast = page.getByRole("region", { name: "Cast" });
  await expect(cast.getByRole("listitem").filter({ hasText: "Mara Ellison" }).locator("img")).toHaveCount(1);
  const junie = cast.getByRole("listitem").filter({ hasText: "Junie Park" });
  await expect(junie.locator("img")).toHaveCount(0);
  await expect(junie).toContainText("JP");
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`a resuming item with two versions keeps its action bar on one row at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installMockServer(page);
    await signIn(page, "#/next/item/m2");

    const bar = page.locator(".ui-action-bar");
    await expect(page.getByRole("link", { name: /^Resume from/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Version/ })).toBeVisible();
    const tops = await bar.locator("a, button").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
    // Resume, Version, Audio (P17-08), Start over, Watched, Favorite.
    await expect(page.getByRole("button", { name: /^Audio/ })).toBeVisible();
    expect(tops.length).toBe(6);
    expect(new Set(tops).size).toBe(1);
  });
}

// P17-08, owner decision 2026-11-16: the audio pill always shows the full track label on one line; a bar that
// cannot fit it wraps.
const LONG_AUDIO = "English · Director's commentary with cast · AC-3 Stereo";
for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  test(`a long audio title shows in full and the action bar never overlaps at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installMockServer(page, { longAudioTitle: true });
    await signIn(page, "#/next/item/m2");

    const trigger = page.getByRole("button", { name: /^Audio/ });
    await expect(trigger).toBeVisible();
    const value = trigger.locator(".ui-picker-value");
    await expect(value).toHaveText(LONG_AUDIO);

    const facts = await value.evaluate((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const lineHeight = parseFloat(style.lineHeight);
      return {
        textOverflow: style.textOverflow,
        overflow: style.overflow,
        maxWidth: style.maxWidth,
        clipped: node.scrollWidth > node.clientWidth,
        lines: Math.round(box.height / lineHeight),
      };
    });
    expect(facts.textOverflow).toBe("clip");
    expect(facts.overflow).toBe("visible");
    expect(facts.maxWidth).toBe("none");
    expect(facts.clipped).toBe(false);
    // One line whenever the label fits in the window. At 390 px it is wider than the window, so it wraps
    // inside its pill rather than scroll the page sideways (recorded in docs/specs/P17-08.md decision 16).
    if (viewport.width > 390) expect(facts.lines).toBe(1);

    // The whole label sits inside its pill, and the pill inside the window.
    const pill = await trigger.boundingBox();
    const text = await value.boundingBox();
    expect(pill && text && text.x >= pill.x && text.x + text.width <= pill.x + pill.width).toBe(true);
    expect(pill!.x + pill!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // No two controls in the bar overlap.
    const boxes = await page.locator(".ui-action-bar").locator("a, button").evaluateAll((nodes) => nodes.map((node) => {
      const { left, right, top, bottom } = node.getBoundingClientRect();
      return { left, right, top, bottom };
    }));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlaps = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        expect(overlaps, `controls ${i} and ${j} overlap`).toBe(false);
      }
    }
    // The six controls share one row where they fit (1440 px and wider), and the bar wraps where they do not.
    const rows = new Set(boxes.map((box) => Math.round(box.top))).size;
    if (viewport.width > 390) expect(rows).toBe(1);
    else expect(rows).toBeGreaterThan(1);
  });
}
