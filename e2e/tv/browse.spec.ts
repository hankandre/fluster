import { expect, test, type Page } from "@playwright/test";
import { expectNoSmallText, expectTitleSafe, signInTv } from "./support";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const header = (page: Page) => page.getByRole("banner");
const key = async (page: Page, ...keys: string[]) => {
  for (const name of keys) await page.keyboard.press(name);
};

// Opens a nav entry with the keyboard: Up to the nav's current entry, Right to the entry, Enter.
async function openFromNav(page: Page, entry: RegExp | string, presses: string[] = []): Promise<void> {
  await page.keyboard.press("ArrowUp");
  await key(page, ...presses);
  await expect(nav(page).getByRole("link", { name: entry })).toBeFocused();
  await page.keyboard.press("Enter");
}

test("Home: the hero takes focus, Menu opens details, Up reaches the nav, Escape returns to it", async ({ page }) => {
  await signInTv(page);
  const primary = page.locator(".hero-actions a").first();
  await expect(primary).toBeFocused({ timeout: 10_000 });
  await expect(header(page)).toHaveAttribute("data-hidden", "true");
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  // Menu opens the hero's details where Enter would play; Backspace is Back.
  await page.keyboard.press("ContextMenu");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(page.locator(".hero-actions a").first()).toBeFocused();

  // Down to Continue watching: Menu opens details; Escape comes back.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".home-rows [data-media-card]").first()).toBeFocused();
  await page.keyboard.press("ContextMenu");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await expect(page.getByRole("link", { name: /^(Play|Resume)/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);

  // Back restores the card that was left (DESIGN.md 9), where it used to open on the hero; Enter on it plays.
  await expect(page.locator(".home-rows [data-media-card]").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/(home|item\/[^/]+)$/);
});

test("Home: holding OK on a Continue watching card opens details; Back on Home leaves the app", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __leaves: number };
    w.__leaves = 0;
    window.addEventListener("fluster:leave-app", () => { w.__leaves += 1; });
  });
  const leaves = () => page.evaluate(() => (window as unknown as { __leaves: number }).__leaves);
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".home-rows [data-media-card]").first()).toBeFocused();

  // Hold OK: details open, the auto-repeat after navigation does not press Play, release does nothing more.
  await page.keyboard.down("Enter");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await page.keyboard.down("Enter");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await expect(page.getByRole("link", { name: /^(Play|Resume)/ })).toBeFocused();
  await page.keyboard.up("Enter");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);

  // Back restores the card that was held (DESIGN.md 9); Back from there reaches the nav, and Back on Home from the nav leaves without a question.
  await expect(page.locator(".home-rows [data-media-card]").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("link", { name: "Home" })).toBeFocused();
  expect(await leaves()).toBe(0);
  await page.keyboard.press("Escape");
  expect(await leaves()).toBe(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/next\/home$/);
  await page.keyboard.press("Backspace");
  expect(await leaves()).toBe(2);
});

test("Home: on a platform that confirms, Back on Home asks Leave Fluster?", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __leaves: number };
    w.__leaves = 0;
    window.addEventListener("fluster:leave-app", () => { w.__leaves += 1; });
    // The root element may not exist yet when an init script runs.
    document.addEventListener("readystatechange", () => { document.documentElement.dataset.tvPlatform = "tizen"; });
    if (document.documentElement) document.documentElement.dataset.tvPlatform = "tizen";
  });
  const leaves = () => page.evaluate(() => (window as unknown as { __leaves: number }).__leaves);
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("link", { name: "Home" })).toBeFocused();
  await page.keyboard.press("Escape");
  const dialog = page.getByRole("alertdialog", { name: "Leave Fluster?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Stay" })).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  expect(await leaves()).toBe(0);

  await page.keyboard.press("Backspace");
  await expect(dialog).toBeHidden();
  expect(await leaves()).toBe(0);
  await expect(nav(page).getByRole("link", { name: "Home" })).toBeFocused();
  await expect(page).toHaveURL(/#\/next\/home$/);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("button", { name: "Leave" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect(await leaves()).toBe(1);
});

test("Home: Up from the hero reaches the nav, Right picks a library, Down returns; Escape focuses the nav", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("ArrowUp");
  await expect(nav(page).getByRole("link", { name: "Home" })).toBeFocused();
  await expect(header(page)).toHaveAttribute("data-hidden", "false");
  await expectTitleSafe(page);
  await page.keyboard.press("ArrowRight");
  await expect(nav(page).getByRole("link", { name: "Movies" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".hero-actions a").first()).toBeFocused();
  await expect(header(page)).toHaveAttribute("data-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("link", { name: "Home" })).toBeFocused();
  await expect(header(page)).toHaveAttribute("data-hidden", "false");
  // Escape on a root tab with the nav focused does nothing more.
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("link", { name: "Home" })).toBeFocused();
});

test("Library: Sort opens as a sheet, a chip filters, Load more focuses the first new card", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined; });
  await signInTv(page, { bigLibrary: true });
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await openFromNav(page, "Movies", ["ArrowRight"]);
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies$/);
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeVisible();
  await expect(page.locator(".library-grid a.media-card").first()).toBeVisible();

  // Down from the nav enters the page.
  await page.keyboard.press("ArrowDown");
  await expectTitleSafe(page);
  await expectNoSmallText(page);
  const sort = page.getByRole("button", { name: /^Sort/ });
  await expect(page.locator(":focus")).toHaveCount(1);
  if (!(await sort.evaluate((element) => element === document.activeElement))) await page.keyboard.press("ArrowUp");

  await expect(sort).toBeFocused();
  await page.keyboard.press("Enter");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(list).toHaveClass(/ui-picker-list--sheet/);
  await expectNoSmallText(page);
  await expectTitleSafe(page, "[role='listbox']");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(sort).toBeFocused();
  await expect(sort).toContainText("Name Z to A");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Unwatched" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Unwatched" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Unwatched" })).toHaveAttribute("aria-pressed", "false");

  await expect(page.getByRole("button", { name: "Unwatched" })).toBeFocused();
  await expect(page.locator(".library-grid a.media-card").first()).toBeVisible();
  await expect(page.locator(".library-grid [aria-busy='true']")).toHaveCount(0);
  // Down into the grid, End to the last card, Down to Load more, Enter focuses the first new card.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".library-grid a.media-card:focus")).toHaveCount(1);
  const loaded = await page.locator(".library-grid a.media-card").count();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  const more = page.getByRole("button", { name: "Load more" });
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".library-grid a.media-card").nth(loaded)).toBeFocused();

  // Escape on a root tab focuses the nav's current entry.
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("link", { name: "Movies" })).toBeFocused();
});

test("Collection: Escape goes back; an unknown library offers Go home", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.evaluate(() => { window.location.hash = "#/next/collection/box-1"; });
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Collection" })).toBeVisible();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);

  await page.evaluate(() => { window.location.hash = "#/next/browse/nope"; });
  await expect(page.getByRole("heading", { name: "This library isn't available" })).toBeVisible();
  await expectNoSmallText(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("link", { name: "Go home" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("Search: Up from the field reaches the nav; Enter on a hint opens it; results rows go Up to the field", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await key(page, "End", "ArrowLeft");
  await expect(nav(page).getByRole("link", { name: "Search" })).toBeFocused();
  await page.keyboard.press("Enter");
  const field = page.getByRole("combobox");
  await expect(field).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(field).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  await page.keyboard.insertText("the");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expectNoSmallText(page);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/(item|series)\//);
  await expect(page.getByRole("link", { name: /^(Play|Resume)/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/search/);

  await page.evaluate(() => { window.location.hash = "#/next/search/o"; });
  await expect(page.locator(".media-card").first()).toBeVisible();
  await expect(field).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".media-card:focus")).toHaveCount(1);
  await expectTitleSafe(page);
  await page.keyboard.press("ArrowUp");
  await expect(field).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(nav(page).getByRole("link", { name: "Search" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(field).toBeFocused();
  // Backspace in the field deletes a character, and does not go back.
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/search\/o$/);
});

test("Settings: arrows reach the sections and rows; the limit picker is a sheet; Escape focuses the nav", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await openFromNav(page, "Settings", ["End"]);
  await expect(page).toHaveURL(/#\/next\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expectNoSmallText(page);

  await page.keyboard.press("ArrowDown");
  await expectTitleSafe(page);
  const limit = page.getByRole("button", { name: /^Limit|Streaming limit|No limit/ }).first();
  await expect(limit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveClass(/ui-picker-list--sheet/);
  await expectNoSmallText(page);
  await expectTitleSafe(page, "[role='listbox']");
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(limit).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Playback" }).or(page.getByRole("button", { name: "Playback" }))).toBeFocused();
  await key(page, "ArrowDown", "ArrowDown");
  await expect(page.getByRole("tab", { name: "Account" }).or(page.getByRole("button", { name: "Account" }))).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("link", { name: "Settings" })).toBeFocused();
});
