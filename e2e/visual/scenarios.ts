import type { Page } from "@playwright/test";
import { LAN, SERVER, ticks, frameDataUrl, type MockOptions } from "../support/mock-server";

export interface Scenario {
  name: string;
  opts?: MockOptions;
  fullPage?: boolean;
  // Defaults to the desktop viewports. Phone shots run at 390x844 only.
  phone?: boolean;
  // Captured only in the TV form (1920x1080-tv), with keyboard-driven states.
  tvOnly?: boolean;
  // Skipped in the TV pass: the state needs a pointer or a desktop-only key (the TV has neither).
  desktopOnly?: boolean;
  // Set when the scenario deliberately provokes a 404 from the mock server.
  expect404?: boolean;
  run: (page: Page) => Promise<void>;
}

const intro = [{ Id: "seg-1", Type: "Intro", StartTicks: 0, EndTicks: ticks(90) }];

async function go(page: Page, hash: string, settle = 500): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForTimeout(settle);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

// Signs in, then opens Settings through the nav.
async function openSettings(page: Page): Promise<void> {
  await signIn(page);
  if (await page.evaluate(() => document.documentElement.dataset.form === "tv")) {
    // The TV form has no pointer: Up reaches the tab row, End the Settings entry.
    await page.waitForTimeout(800);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
  } else {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  }
  await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
}

async function startConnect(page: Page, url: string): Promise<void> {
  await go(page, "#/next/sign-in", 200);
  await page.getByLabel("Server URL").fill(url);
  await page.keyboard.press("Enter");
}

async function signedInAt(page: Page, hash: string, settle = 600): Promise<void> {
  await signIn(page);
  await go(page, hash, settle);
}

// Paints a synthetic frame behind the browser player's <video>.
async function play(page: Page, itemHash: string): Promise<void> {
  await signedInAt(page, itemHash);
  await page.getByRole("link", { name: /^(Play|Resume from)/ }).first().click();
  await page.locator("video").waitFor({ state: "attached", timeout: 8_000 });
  await page.addStyleTag({ content: `.browser-player{background:#000 url(${frameDataUrl()}) center/cover no-repeat !important}` });
  await page.waitForTimeout(400);
  await page.mouse.move(700, 450);
  await page.mouse.move(720, 460);
  await page.waitForTimeout(300);
}

// Moves the browser player's clock and tells the app.
async function seekPlayerTo(page: Page, seconds: number): Promise<void> {
  await page.locator("video").evaluate((video, position) => {
    (video as HTMLVideoElement).currentTime = position;
    video.dispatchEvent(new Event("timeupdate"));
  }, seconds);
}

// The search page with suggestions for "the" showing.
async function searchHints(page: Page): Promise<void> {
  await signedInAt(page, "#/next/search");
  await page.getByRole("combobox").fill("the");
  await page.getByRole("listbox").waitFor();
  await page.waitForTimeout(300);
}

export const scenarios: Scenario[] = [
  // Sign-in
  { name: "01-signin-server", run: (page) => go(page, "#/next/sign-in") },
  { name: "02-signin-server-error", run: async (page) => {
    await startConnect(page, "http://media.example");
    await page.getByRole("alert").waitFor();
  } },
  { name: "02a-signin-unreachable", run: async (page) => {
    await page.route("https://nas.test/**", (route) => route.abort());
    await startConnect(page, "https://nas.test");
    await page.getByRole("alert").waitFor();
  } },
  { name: "03-signin-unencrypted-confirm", run: async (page) => {
    await startConnect(page, LAN);
    await page.getByRole("button", { name: "Connect without encryption" }).waitFor();
  } },
  { name: "04-signin-quick-connect", opts: { holdQuickConnect: true }, run: async (page) => {
    await startConnect(page, SERVER);
    await page.getByTestId("quick-connect-code").getByText("482").waitFor();
  } },
  { name: "04a-signin-quick-connect-expired", opts: { quickConnectExpired: true }, run: async (page) => {
    await startConnect(page, SERVER);
    await page.getByText("This code expired.").waitFor({ timeout: 6_000 });
  } },
  { name: "05-signin-password", opts: { noQuickConnect: true }, run: async (page) => {
    await startConnect(page, SERVER);
    await page.getByLabel("Username").waitFor();
  } },
  { name: "06-signin-password-error", opts: { noQuickConnect: true }, run: async (page) => {
    await startConnect(page, SERVER);
    await page.getByLabel("Username").fill("sam");
    await page.getByLabel("Password").fill("wrong");
    await page.keyboard.press("Enter");
    await page.getByRole("alert").waitFor();
  } },

  { name: "07-signin-discovery", fullPage: true, run: async (page) => {
    await go(page, "#/next/gallery", 600);
    await page.getByRole("region", { name: "Sign-in discovery found" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  } },
  { name: "07a-signin-discovery-states", fullPage: true, run: async (page) => {
    await go(page, "#/next/gallery", 600);
    await page.getByRole("region", { name: "Sign-in discovery states" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  } },

  // Home
  { name: "10-home", run: async (page) => { await signIn(page); await page.waitForTimeout(900); } },
  { name: "11-home-fullpage", fullPage: true, run: async (page) => { await signIn(page); await page.waitForTimeout(900); } },
  { name: "12-home-loading", opts: { rowDelayMs: 6_000 }, run: async (page) => {
    await page.goto("/#/next/sign-in");
    await page.getByLabel("Server URL").fill(SERVER);
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);
  } },
  { name: "13-home-empty", opts: { empty: true }, run: async (page) => { await signIn(page); await page.waitForTimeout(800); } },
  { name: "14-home-keyboard-focus", run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(800);
    // The skip link and the nav come first; press Tab until a card in main has focus.
    let reachedCard = false;
    for (let presses = 0; presses < 10 && !reachedCard; presses += 1) {
      await page.keyboard.press("Tab");
      reachedCard = await page.evaluate(() => document.activeElement?.matches("main [data-media-card]") ?? false);
    }
    if (!reachedCard) throw new Error("Tab never reached a card in main");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
  } },
  { name: "15-nav-keyboard-focus", run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(800);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
  } },
  { name: "17-home-row-focus-down", run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(800);
    let reachedCard = false;
    for (let presses = 0; presses < 10 && !reachedCard; presses += 1) {
      await page.keyboard.press("Tab");
      reachedCard = await page.evaluate(() => document.activeElement?.matches("main [data-media-card]") ?? false);
    }
    if (!reachedCard) throw new Error("Tab never reached a card in main");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
  } },
  { name: "18-home-row-paging", desktopOnly: true, opts: { longRows: true }, run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(800);
    const row = page.getByRole("region", { name: "Latest in Movies" });
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    await row.locator(".media-row-page--next button").click();
    await page.waitForTimeout(700);
  } },
  { name: "19a-home-hero-newest", opts: { homeLatestOnly: true }, run: async (page) => { await signIn(page); await page.waitForTimeout(1_200); } },
  { name: "19b-home-ambient-follow", run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(800);
    const card = page.getByRole("region", { name: "Latest in Movies" }).locator("a.media-card").nth(1);
    await card.focus();
    await page.waitForTimeout(700);
  } },
  { name: "19c-home-scrolled-nav", run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(300);
  } },
  { name: "16-nav-library-current", run: (page) => signedInAt(page, "#/next/browse/lib-movies", 1_000) },

  // Browse
  { name: "20-library-loading", opts: { libraryItemsDelayMs: 4_000 }, run: (page) => signedInAt(page, "#/next/browse/lib-movies", 300) },
  { name: "19d-home-see-all", run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(900);
    await page.getByRole("region", { name: "Latest in Movies" }).locator("a.media-card").last().focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
  } },
  { name: "21-library-grid", run: (page) => signedInAt(page, "#/next/browse/lib-movies", 1_000) },
  { name: "21a-library-sort-open", run: async (page) => {
    await signedInAt(page, "#/next/browse/lib-movies", 1_000);
    await page.getByRole("button", { name: /^Sort/ }).click();
    await page.getByRole("listbox").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "21b-library-filtered", run: async (page) => {
    await signedInAt(page, "#/next/browse/lib-movies", 1_000);
    await page.getByRole("button", { name: "Unwatched" }).click();
    await page.waitForTimeout(800);
  } },
  { name: "21c-library-filtered-empty", run: async (page) => {
    await signedInAt(page, "#/next/browse/lib-movies", 1_000);
    await page.getByRole("button", { name: "In progress" }).click();
    await page.getByRole("button", { name: "Favorites" }).click();
    await page.getByRole("heading", { name: "Nothing matches these filters" }).waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "21d-library-error", opts: { libraryItemsError: true }, run: async (page) => {
    await signedInAt(page, "#/next/browse/lib-movies", 300);
    await page.getByText("Couldn't load Movies.").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);
  } },
  { name: "21e-library-scrolled", opts: { bigLibrary: true }, run: async (page) => {
    await signedInAt(page, "#/next/browse/lib-movies", 1_500);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollBy(0, -20));
    await page.waitForTimeout(700);
  } },
  { name: "21f-library-load-more-focus", opts: { bigLibrary: true }, run: async (page) => {
    await page.addInitScript(() => { (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined; });
    await signedInAt(page, "#/next/browse/lib-movies", 1_500);
    await page.locator(".library-grid a.media-card").first().focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(500);
  } },
  { name: "21g-collection", run: (page) => signedInAt(page, "#/next/collection/box-1", 1_000) },
  { name: "21h-library-not-found", run: (page) => signedInAt(page, "#/next/browse/nope", 1_000) },
  { name: "22-series-episodes", run: (page) => signedInAt(page, "#/next/series/s1", 1_000) },
  { name: "23-series-episodes-fullpage", fullPage: true, run: (page) => signedInAt(page, "#/next/series/s1", 1_000) },
  { name: "24-series-play-next", opts: { seriesNextUp: "next" }, run: (page) => signedInAt(page, "#/next/series/s1", 1_000) },
  { name: "25-series-watched", opts: { seriesNextUp: "none" }, run: (page) => signedInAt(page, "#/next/series/s1", 1_000) },
  { name: "26-series-specials", run: async (page) => {
    await signedInAt(page, "#/next/series/s1", 1_000);
    await page.getByRole("tab", { name: "Specials" }).click();
    await page.waitForTimeout(500);
  } },
  { name: "27-series-loading", opts: { detailDelayMs: 6_000 }, run: async (page) => {
    await signIn(page);
    await page.evaluate(() => { window.location.hash = "#/next/series/s1"; });
    await page.waitForTimeout(400);
  } },
  { name: "28-series-error", opts: { detailError: true }, run: async (page) => {
    await signedInAt(page, "#/next/series/s1", 800);
    await page.getByRole("button", { name: "Retry" }).waitFor();
  } },
  { name: "29-series-not-found", expect404: true, run: (page) => signedInAt(page, "#/next/series/nope", 1_000) },
  { name: "29a-series-row-focus", run: async (page) => {
    await signedInAt(page, "#/next/series/s1", 1_000);
    await page.getByRole("tab", { name: "Season 1" }).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
  } },

  // Search
  { name: "30-search-start", run: (page) => signedInAt(page, "#/next/search") },
  { name: "31-search-hints", run: searchHints },
  { name: "31a-search-hints-active", run: async (page) => {
    await searchHints(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
  } },
  { name: "32-search-results", run: (page) => signedInAt(page, "#/next/search/o", 1_000) },
  { name: "32a-search-results-fullpage", fullPage: true, run: (page) => signedInAt(page, "#/next/search/o", 1_000) },
  { name: "32b-search-results-focus", run: async (page) => {
    await signedInAt(page, "#/next/search/o", 1_000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
  } },
  { name: "33-search-no-results", run: (page) => signedInAt(page, "#/next/search/zzzz", 800) },
  { name: "34-search-loading", opts: { searchDelayMs: 6_000 }, run: (page) => signedInAt(page, "#/next/search/o", 400) },
  { name: "35-search-error", opts: { searchError: true }, run: async (page) => {
    await signedInAt(page, "#/next/search/o", 400);
    await page.getByRole("button", { name: "Retry" }).waitFor();
  } },
  { name: "36-search-load-more", opts: { longSearch: true }, run: async (page) => {
    await signedInAt(page, "#/next/search/o", 1_000);
    await page.getByRole("button", { name: "Load more" }).scrollIntoViewIfNeeded();
    // Forty cards sit in one row; lazy images far off screen would never finish loading for the capture.
    await page.evaluate(() => document.querySelectorAll("img").forEach((image) => { image.loading = "eager"; }));
    await page.waitForTimeout(800);
  } },

  // Item detail
  { name: "40-detail-movie", run: (page) => signedInAt(page, "#/next/item/m1", 1_000) },
  { name: "41-detail-movie-fullpage", fullPage: true, run: (page) => signedInAt(page, "#/next/item/m1", 1_000) },
  { name: "42-detail-resume", run: (page) => signedInAt(page, "#/next/item/m2", 1_000) },
  { name: "43-detail-played-favorite", run: (page) => signedInAt(page, "#/next/item/m3", 1_000) },
  { name: "43a-detail-watched-toast", run: async (page) => {
    await signedInAt(page, "#/next/item/m1", 1_000);
    await page.getByRole("button", { name: "Watched" }).click();
    await page.getByText("Marked as watched.").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "43b-detail-watched-error", opts: { flagError: true }, run: async (page) => {
    await signedInAt(page, "#/next/item/m1", 1_000);
    await page.getByRole("button", { name: "Watched" }).click();
    await page.getByText("Couldn't update watched state. Try again.").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "43c-detail-favorite-error", opts: { flagError: true }, run: async (page) => {
    await signedInAt(page, "#/next/item/m1", 1_000);
    await page.getByRole("button", { name: "Favorite" }).click();
    await page.getByText("Couldn't update favorite. Try again.").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "44-detail-episode", fullPage: true, run: (page) => signedInAt(page, "#/next/item/ep-2", 1_000) },
  { name: "45-detail-not-found", expect404: true, run: (page) => signedInAt(page, "#/next/item/nope", 1_000) },
  { name: "46-detail-version-picker", run: async (page) => {
    await signedInAt(page, "#/next/item/m1", 1_000);
    await page.getByRole("button", { name: /^Version/ }).click();
    await page.waitForTimeout(300);
  } },
  { name: "47-detail-loading", opts: { detailDelayMs: 6_000 }, run: async (page) => {
    await signIn(page);
    await page.evaluate(() => { window.location.hash = "#/next/item/m1"; });
    await page.waitForTimeout(400);
  } },
  { name: "48-detail-error", opts: { detailError: true }, run: async (page) => {
    await signedInAt(page, "#/next/item/m1", 800);
    await page.getByRole("button", { name: "Retry" }).waitFor();
  } },
  { name: "49-detail-no-backdrop", opts: { noBackdrop: true }, run: (page) => signedInAt(page, "#/next/item/m1", 1_000) },

  // Player
  { name: "50-player-controls", opts: { trickplay: true }, run: (page) => play(page, "#/next/item/m1") },
  { name: "51-player-idle", run: async (page) => { await play(page, "#/next/item/m1"); await page.waitForTimeout(3_400); } },
  { name: "52-player-info-panel", run: async (page) => {
    await play(page, "#/next/item/m1");
    await page.getByRole("button", { name: "Info" }).click();
    await page.waitForTimeout(300);
  } },
  { name: "53-player-seek-preview", opts: { trickplay: true }, run: async (page) => {
    await play(page, "#/next/item/m1");
    const box = await page.locator(".seek-track").boundingBox();
    if (!box) throw new Error("seek track not found");
    await page.mouse.move(box.x + box.width * 0.42, box.y + box.height / 2);
    await page.waitForTimeout(700);
  } },
  { name: "59-player-track-panel", run: async (page) => {
    await play(page, "#/next/item/m1");
    await page.getByRole("button", { name: "Audio & Subtitles" }).click();
    await page.getByRole("region", { name: "Audio and subtitles" }).waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "59a-player-osd", desktopOnly: true, run: async (page) => {
    await play(page, "#/next/item/m1");
    await page.keyboard.press("ArrowRight");
    await page.getByRole("status", { name: "Player message" }).getByText("+10 s").waitFor();
    await page.waitForTimeout(150);
  } },
  { name: "59b-player-paused", run: async (page) => {
    await play(page, "#/next/item/m1");
    await page.keyboard.press("k");
    await page.waitForTimeout(3_400);
  } },
  { name: "59c-player-scrub-focus", opts: { trickplay: true }, run: async (page) => {
    await play(page, "#/next/item/m1");
    await page.getByRole("slider", { name: "Playback position" }).focus();
    await page.waitForTimeout(500);
  } },
  { name: "54-player-skip-intro", opts: { segments: intro }, run: async (page) => {
    await play(page, "#/next/item/m4");
    await page.locator("video").evaluate((video) => {
      (video as HTMLVideoElement).currentTime = 20;
      video.dispatchEvent(new Event("timeupdate"));
    });
    await page.getByRole("button", { name: "Skip intro" }).waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "55-player-next-episode", opts: { duration: 25, short: true }, run: async (page) => {
    await play(page, "#/next/item/ep-1");
    await page.getByRole("complementary", { name: "Up next" }).waitFor({ timeout: 8_000 });
    await page.waitForTimeout(300);
  } },
  { name: "54a-player-skip-hidden-chrome", opts: { segments: intro }, run: async (page) => {
    await play(page, "#/next/item/m4");
    await seekPlayerTo(page, 20);
    await page.getByRole("button", { name: "Skip intro" }).waitFor();
    await page.mouse.move(5, 5);
    await page.mouse.move(8, 8);
    await page.waitForTimeout(3_400);
  } },
  { name: "54b-player-skip-sheet-open", opts: { segments: intro }, run: async (page) => {
    await play(page, "#/next/item/m4");
    await seekPlayerTo(page, 20);
    await page.getByRole("button", { name: "Skip intro" }).waitFor();
    await page.getByRole("button", { name: "Audio & Subtitles" }).click();
    await page.getByRole("region", { name: "Audio and subtitles" }).waitFor();
    await page.waitForTimeout(500);
  } },
  { name: "55a-player-next-episode-chrome", opts: { duration: 25, short: true }, run: async (page) => {
    await play(page, "#/next/item/ep-1");
    await page.getByRole("complementary", { name: "Up next" }).waitFor({ timeout: 8_000 });
    await page.mouse.move(700, 400);
    await page.mouse.move(720, 410);
    await page.waitForTimeout(500);
  } },
  { name: "55b-player-next-episode-reduced-motion", opts: { duration: 25, short: true }, run: async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await play(page, "#/next/item/ep-1");
    await page.getByRole("complementary", { name: "Up next" }).waitFor({ timeout: 8_000 });
    await page.waitForTimeout(300);
  } },
  { name: "56-player-loading", opts: { playbackDelayMs: 20_000 }, run: async (page) => {
    await signedInAt(page, "#/next/item/m4");
    await page.getByRole("link", { name: "Play" }).click();
    await page.waitForTimeout(1_200);
  } },
  { name: "57-player-error", opts: { fail: true }, run: async (page) => {
    await signedInAt(page, "#/next/item/m4");
    await page.getByRole("link", { name: "Play" }).click();
    await page.getByText("Playback could not start").waitFor();
  } },
  { name: "58-player-refusal", opts: { disc: true }, run: async (page) => {
    await signedInAt(page, "#/next/item/m1", 1_000);
    await page.getByRole("link", { name: "Play" }).click();
    await page.getByRole("alert").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "58a-player-desktop-only", opts: { converted: true }, run: async (page) => {
    await signedInAt(page, "#/next/item/m4");
    await page.getByRole("link", { name: "Play" }).click();
    await page.getByText("This stream needs the desktop player").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "58b-player-load-error", opts: { detailError: true }, run: async (page) => {
    await signedInAt(page, "#/next/play/m4");
    await page.getByText("Couldn't load this item").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "58c-player-item-gone", expect404: true, run: async (page) => {
    await signedInAt(page, "#/next/play/nowhere");
    await page.getByText("This item is no longer on the server").waitFor();
    await page.waitForTimeout(300);
  } },

  // Other routes
  { name: "60-features-index", run: (page) => signedInAt(page, "#/next") },
  { name: "61-not-found", run: (page) => signedInAt(page, "#/next/nowhere") },
  { name: "70-settings", run: async (page) => {
    await openSettings(page);
    await page.getByRole("tab", { name: "Playback", selected: true }).waitFor();
  } },
  { name: "70a-settings-limit-open", run: async (page) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^Remote maximum bitrate/ }).click();
    await page.getByRole("listbox").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "70b-settings-row-focus", run: async (page) => {
    await openSettings(page);
    await page.getByRole("tab", { name: "Playback" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
  } },
  { name: "70c-settings-limit-toast", run: async (page) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^Remote maximum bitrate/ }).click();
    await page.getByRole("option", { name: "10 Mbps", exact: true }).click();
    await page.getByText("Remote limit set to 10 Mbps.").waitFor();
    await page.waitForTimeout(400);
  } },
  { name: "71-settings-subtitles", run: async (page) => {
    await openSettings(page);
    await page.getByRole("tab", { name: "Subtitles" }).click();
    await page.getByRole("heading", { level: 2, name: "Subtitles" }).waitFor();
  } },
  { name: "72-settings-account", run: async (page) => {
    await openSettings(page);
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByText("Hearth").waitFor();
  } },
  { name: "72a-settings-signed-out-toast", run: async (page) => {
    await openSettings(page);
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByText("Signed out").waitFor();
    await page.waitForTimeout(400);
  } },
  { name: "73-settings-about", run: async (page) => {
    await openSettings(page);
    await page.getByRole("tab", { name: "About & diagnostics" }).click();
    await page.getByText("Browser (development)").waitFor();
    await page.getByText("10.11.7").waitFor();
  } },
  { name: "73a-settings-copy-fallback", run: async (page) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
    });
    await openSettings(page);
    await page.getByRole("tab", { name: "About & diagnostics" }).click();
    await page.getByText("10.11.7").waitFor();
    await page.getByRole("button", { name: "Copy" }).click();
    await page.getByRole("alert").waitFor();
    await page.waitForTimeout(300);
  } },

  // UI gallery (browser development only)
  { name: "80-ui-gallery", fullPage: true, run: (page) => go(page, "#/next/gallery", 600) },
  { name: "88-ui-gallery-player", fullPage: true, run: async (page) => {
    await go(page, "#/next/gallery", 600);
    await page.getByRole("button", { name: "Open Info sheet" }).click();
    await page.getByRole("region", { name: "Player information" }).waitFor();
    await page.getByRole("group", { name: "Conversion notice" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  } },
  { name: "89-ui-gallery-player-cannot-start", run: async (page) => {
    await go(page, "#/next/gallery", 600);
    await page.getByRole("button", { name: "Show Player cannot start" }).click();
    await page.getByRole("heading", { name: "The player cannot start" }).waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "87-ui-gallery-media-cards", run: async (page) => {
    await go(page, "#/next/gallery", 600);
    await page.getByRole("region", { name: "Media cards" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  } },
  { name: "81-ui-gallery-picker-open", run: async (page) => {
    await go(page, "#/next/gallery", 400);
    await page.getByRole("button", { name: /^Streaming limit/ }).click();
    await page.getByRole("listbox").waitFor();
    await page.keyboard.press("ArrowDown");
  } },
  { name: "82-ui-gallery-dialog", run: async (page) => {
    await go(page, "#/next/gallery", 400);
    await page.getByRole("button", { name: "Open dialog" }).click();
    await page.getByRole("dialog").waitFor();
  } },
  { name: "85-ui-gallery-dialog-picker", run: async (page) => {
    await go(page, "#/next/gallery", 400);
    await page.getByRole("button", { name: "Open dialog" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await page.getByRole("listbox").waitFor();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
  } },
  { name: "86-ui-gallery-dialog-keyboard", run: async (page) => {
    await go(page, "#/next/gallery", 400);
    await page.getByRole("button", { name: "Open dialog" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(150);
  } },
  { name: "83-ui-gallery-toasts", run: async (page) => {
    await go(page, "#/next/gallery", 400);
    await page.getByRole("button", { name: "Show toast" }).click();
    await page.getByRole("button", { name: "Show error toast" }).click();
    await page.getByText("Marked as watched.").waitFor();
  } },
  { name: "84-ui-gallery-keyboard-focus", run: async (page) => {
    await go(page, "#/next/gallery", 400);
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
    await page.waitForTimeout(150);
  } },

  // Phone
  { name: "62-phone-home", phone: true, run: async (page) => { await signIn(page); await page.waitForTimeout(900); } },
  { name: "63-phone-detail", phone: true, fullPage: true, run: (page) => signedInAt(page, "#/next/item/m1", 1_000) },
  { name: "64-phone-series", phone: true, fullPage: true, run: (page) => signedInAt(page, "#/next/series/s1", 1_000) },
  { name: "65-phone-library", phone: true, run: (page) => signedInAt(page, "#/next/browse/lib-movies", 1_000) },
  { name: "66-phone-nav-fade", phone: true, opts: { manyLibraries: true }, run: (page) => signedInAt(page, "#/next/home", 1_000) },
  { name: "67-phone-search-hints", phone: true, run: searchHints },
  { name: "68-phone-search-results", phone: true, fullPage: true, run: (page) => signedInAt(page, "#/next/search/o", 1_000) },
  { name: "74-phone-settings-list", phone: true, run: async (page) => {
    await openSettings(page);
    await page.getByRole("navigation", { name: "Settings sections" }).waitFor();
  } },
  { name: "74a-phone-settings-section", phone: true, run: async (page) => {
    await openSettings(page);
    await page.getByRole("button", { name: "Playback" }).click();
    await page.getByRole("button", { name: "Back to settings" }).waitFor();
    await page.waitForTimeout(300);
  } },

  // TV form only (P13-18): states a remote reaches with the D-pad.
  { name: "90-tv-home-nav", tvOnly: true, run: async (page) => {
    await signedInAt(page, "#/next/home", 1_200);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(400);
  } },
  { name: "91-tv-series-episode-row", tvOnly: true, run: async (page) => {
    await signedInAt(page, "#/next/series/s1", 1_000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
  } },
  { name: "92-tv-player-chrome", tvOnly: true, run: async (page) => {
    await play(page, "#/next/item/m4");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
  } },
  { name: "93-tv-picker-sheet", tvOnly: true, run: async (page) => {
    await signedInAt(page, "#/next/browse/lib-movies", 1_000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.getByRole("listbox").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "94-tv-sign-in-discovery", tvOnly: true, fullPage: true, run: async (page) => {
    await go(page, "#/next/gallery");
    await page.getByRole("region", { name: "Sign-in discovery found" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  } },
];
