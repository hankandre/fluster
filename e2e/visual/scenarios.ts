import type { Page } from "@playwright/test";
import { LAN, SERVER, ticks, frameDataUrl, type MockOptions } from "../support/mock-server";

export interface Scenario {
  name: string;
  opts?: MockOptions;
  fullPage?: boolean;
  // Defaults to the desktop viewports. Phone shots run at 390x844 only.
  phone?: boolean;
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

export const scenarios: Scenario[] = [
  // Sign-in
  { name: "01-signin-server", run: (page) => go(page, "#/next/sign-in") },
  { name: "02-signin-server-error", run: async (page) => {
    await startConnect(page, "http://media.example");
    await page.getByRole("alert").waitFor();
  } },
  { name: "03-signin-unencrypted-confirm", run: async (page) => {
    await startConnect(page, LAN);
    await page.getByRole("button", { name: "Connect without encryption" }).waitFor();
  } },
  { name: "04-signin-quick-connect", opts: { holdQuickConnect: true }, run: async (page) => {
    await startConnect(page, SERVER);
    await page.getByText("482913").waitFor();
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
  { name: "18-home-row-paging", opts: { longRows: true }, run: async (page) => {
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
  { name: "20-browse-libraries", run: (page) => signedInAt(page, "#/next/browse") },
  { name: "21-library-grid", run: (page) => signedInAt(page, "#/next/browse/lib-movies", 1_000) },
  { name: "22-series-episodes", run: (page) => signedInAt(page, "#/next/series/s1", 1_000) },
  { name: "23-series-episodes-fullpage", fullPage: true, run: (page) => signedInAt(page, "#/next/series/s1", 1_000) },

  // Search
  { name: "30-search-start", run: (page) => signedInAt(page, "#/next/search") },
  { name: "31-search-hints", run: async (page) => {
    await signedInAt(page, "#/next/search");
    await page.getByRole("combobox").fill("the");
    await page.getByRole("listbox").waitFor();
    await page.waitForTimeout(300);
  } },
  { name: "32-search-results", run: (page) => signedInAt(page, "#/next/search/o", 1_000) },
  { name: "33-search-no-results", run: (page) => signedInAt(page, "#/next/search/zzzz", 800) },

  // Item detail
  { name: "40-detail-movie", run: (page) => signedInAt(page, "#/next/item/m1", 1_000) },
  { name: "41-detail-movie-fullpage", fullPage: true, run: (page) => signedInAt(page, "#/next/item/m1", 1_000) },
  { name: "42-detail-resume", run: (page) => signedInAt(page, "#/next/item/m2", 1_000) },
  { name: "43-detail-played-favorite", run: (page) => signedInAt(page, "#/next/item/m3", 1_000) },
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

  // Other routes
  { name: "60-features-index", run: (page) => signedInAt(page, "#/next") },
  { name: "61-not-found", run: (page) => signedInAt(page, "#/next/nowhere") },
  { name: "70-settings", run: async (page) => {
    await signIn(page);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
    await page.getByLabel("Local network maximum bitrate").waitFor();
  } },

  // UI gallery (browser development only)
  { name: "80-ui-gallery", fullPage: true, run: (page) => go(page, "#/next/gallery", 600) },
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
    await page.getByText("Marked as watched").waitFor();
  } },
  { name: "84-ui-gallery-keyboard-focus", run: async (page) => {
    await go(page, "#/next/gallery", 400);
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
    await page.waitForTimeout(150);
  } },

  // Phone
  { name: "62-phone-home", phone: true, run: async (page) => { await signIn(page); await page.waitForTimeout(900); } },
  { name: "63-phone-detail", phone: true, fullPage: true, run: (page) => signedInAt(page, "#/next/item/m1", 1_000) },
];
