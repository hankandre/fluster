import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectFocused, SAFE_X, signInTv, TV_VIEWPORT } from "./support";

// P13-24: Back returns focus to the card that was left, in the 10-foot form, with the keyboard alone.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const focusedRow = (page: Page) => page.evaluate(() => (document.activeElement?.closest("[data-focus-row]") as HTMLElement | null)?.dataset.focusRow ?? "");

// Presses a key until focus sits in the named row, so the journey does not depend on how many rows are above it.
async function pressUntilRow(page: Page, key: string, row: string): Promise<void> {
  for (let attempt = 0; attempt < 8 && (await focusedRow(page)) !== row; attempt += 1) await page.keyboard.press(key);
  expect(await focusedRow(page)).toBe(row);
}

async function expectInsideSafeInsets(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.x).toBeGreaterThanOrEqual(SAFE_X - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(TV_VIEWPORT.width - SAFE_X + 1);
  // Content scrolls vertically, so the vertical bound is the window, as in expectTitleSafe.
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(TV_VIEWPORT.height + 1);
}

async function openFromNav(page: Page, entry: string, presses: string[] = []): Promise<void> {
  await page.keyboard.press("ArrowUp");
  for (const name of presses) await page.keyboard.press(name);
  await expect(nav(page).getByRole("link", { name: entry })).toBeFocused();
  await page.keyboard.press("Enter");
}

test("Home: Back returns to the card that was left, inside the title-safe insets", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("ArrowDown");
  await pressUntilRow(page, "ArrowDown", "Latest in Movies");
  await page.keyboard.press("ArrowRight");
  const card = page.locator(":focus");
  const href = await card.getAttribute("href");
  expect(href).toMatch(/#\/next\/item\//);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
  const same = page.locator(`[data-focus-row="Latest in Movies"] a[href="${href}"]`);
  await expectFocused(same);
  await expectInsideSafeInsets(same);
});

test("Library: Back returns to the card that was left", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined; });
  await signInTv(page, { bigLibrary: true });
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await openFromNav(page, "Movies", ["ArrowRight"]);
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies$/);
  await expect(page.locator(".library-grid a.media-card").first()).toBeVisible();
  await expect(page.locator(".library-grid [aria-busy='true']")).toHaveCount(0);
  // Down from the heading reaches the toolbar; a chip, not the Sort picker, opens onto the grid with Down.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Unwatched" })).toBeFocused();
  await pressUntilRow(page, "ArrowDown", "Library");
  await page.keyboard.press("ArrowRight");
  const href = await page.locator(":focus").getAttribute("href");
  expect(href).toMatch(/#\/next\/item\/big-/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies$/);
  const same = page.locator(`.library-grid a[href="${href}"]`);
  await expectFocused(same);
  await expectInsideSafeInsets(same);
});

test("Search: Back returns to the result card, not the field", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await expect(nav(page).getByRole("link", { name: "Search" })).toBeFocused();
  await page.keyboard.press("Enter");
  const field = page.getByRole("combobox");
  await expect(field).toBeFocused();
  await page.keyboard.insertText("keeper");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/search\/keeper$/);
  await expect(page.locator(".media-card, [data-media-card]").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  const card = page.locator("[data-media-card]:focus");
  await expect(card).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/ep-2$/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/search\/keeper$/);
  const same = page.locator('[data-media-card][href="#/next/item/ep-2"]');
  await expectFocused(same);
  await expectInsideSafeInsets(same);
  await expect(field).not.toBeFocused();
});

test("Series: Back from the player returns to the episode that was played", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.evaluate(() => { window.location.hash = "#/next/series/s1"; });
  await expect(page.getByRole("link", { name: /^(Play|Resume)/ })).toBeFocused();
  const episodes = page.locator(".ui-episode-row-link");
  await expect(episodes.first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(episodes.first()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(episodes.nth(2)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/ep-3/);
  await expect(page.locator("video")).toBeAttached({ timeout: 8_000 });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/series\/s1$/);
  await expectFocused(episodes.nth(2));
  await expectInsideSafeInsets(episodes.nth(2));
});
