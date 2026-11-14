import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";
import { mockPlayerServer, serverUrl } from "./support/player-server";

// P13-24: Back returns focus to the card or episode row that was left (DESIGN.md 9).

async function signIn(page: Page, opts: MockOptions = {}): Promise<void> {
  await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

const go = (page: Page, hash: string) => page.evaluate((target) => { window.location.hash = target; }, hash);
const navLink = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name });
const latestMovies = (page: Page) => page.getByRole("region", { name: "Latest in Movies" });
const itemCard = (scope: Locator, id: string) => scope.locator(`a[href="#/next/item/${id}"]`);
const gridCards = (page: Page) => page.locator(".library-grid a.media-card");
const noObserver = (page: Page) => page.addInitScript(() => { (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined; });
const focusedId = (page: Page) => page.evaluate(() => (document.activeElement?.closest("[data-focus-id]") as HTMLElement | null)?.dataset.focusId ?? "");

test("Home: Escape returns to the card that was left, and the browser Back button does too", async ({ page }) => {
  await signIn(page);
  const row = latestMovies(page);
  await row.getByRole("link").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(itemCard(row, "m4")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/m4$/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(itemCard(row, "m4")).toBeFocused();
  await expect(itemCard(row, "m4")).toBeInViewport();

  await itemCard(row, "m5").click();
  await expect(page).toHaveURL(/#\/next\/item\/m5$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(itemCard(row, "m5")).toBeFocused();
});

test("Home: leaving the player through Escape returns to the Continue watching card", async ({ page }) => {
  await mockPlayerServer(page, { homeResume: true, resumeTicks: 600_000_000 });
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  const card = page.getByRole("region", { name: "Continue watching" }).getByRole("link");
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\//);
  await expect(page.locator("video")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(card).toBeFocused();
});

test("Home: Back returns to the See all tile", async ({ page }) => {
  await signIn(page);
  const row = latestMovies(page);
  await row.getByRole("link").first().focus();
  await page.keyboard.press("End");
  const seeAll = row.getByRole("link", { name: "See all in Movies" });
  await expect(seeAll).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies/);
  // A library is a root tab, where Escape stays put on the desktop; the browser Back button returns.
  await page.goBack();
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(seeAll).toBeFocused();
});

async function chooseSortAndFilter(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.getByRole("listbox").waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Sort Newest added first" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press(" ");
  await expect(page.getByRole("button", { name: "Unwatched" })).toHaveAttribute("aria-pressed", "true");
}

async function openMoviesOnPageTwo(page: Page): Promise<void> {
  await noObserver(page);
  await signIn(page, { bigLibrary: true });
  await navLink(page, "Movies").click();
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeFocused();
  await expect(gridCards(page)).toHaveCount(60);
  await chooseSortAndFilter(page);
  await expect(gridCards(page)).toHaveCount(60);
  await gridCards(page).first().focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(gridCards(page)).toHaveCount(120);
  await expect(gridCards(page).nth(60)).toBeFocused();
}

test("Library: Back restores the sort, the filter, the loaded pages, and the card on page two", async ({ page }) => {
  await openMoviesOnPageTwo(page);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies$/);
  await expect(gridCards(page)).toHaveCount(120);
  await expect(gridCards(page).nth(60)).toBeFocused();
  await expect(page.getByRole("button", { name: "Sort Newest added first" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unwatched" })).toHaveAttribute("aria-pressed", "true");
});

test("Library: a fresh visit starts at the defaults after a restored Back", async ({ page }) => {
  await openMoviesOnPageTwo(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(gridCards(page).nth(60)).toBeFocused();
  await navLink(page, "Home").click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await navLink(page, "Movies").click();
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeFocused();
  await expect(gridCards(page)).toHaveCount(60);
  await expect(page.getByRole("button", { name: "Sort Name A to Z" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unwatched" })).toHaveAttribute("aria-pressed", "false");
});

test("Collection: Back returns to the card that was left", async ({ page }) => {
  await signIn(page);
  await go(page, "#/next/collection/box-1");
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Collection" })).toBeVisible();
  await expect(gridCards(page)).toHaveCount(2);
  await gridCards(page).first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(gridCards(page).nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/collection\/box-1$/);
  await expect(gridCards(page).nth(1)).toBeFocused();
});

test("Search: Back returns to the result card, not the field, and to a card on page two", async ({ page }) => {
  await signIn(page);
  await navLink(page, "Search").click();
  const field = page.getByRole("combobox");
  await field.fill("keeper");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/search\/keeper$/);
  const episode = page.getByRole("region", { name: "Episodes" }).locator("[data-media-card]");
  await expect(episode).toHaveCount(1);
  await expect(field).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(episode).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/ep-2$/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/search\/keeper$/);
  await expect(episode).toBeFocused();
  await expect(field).not.toBeFocused();
});

test("Search: Back returns to a card loaded by Load more", async ({ page }) => {
  await signIn(page, { longSearch: true });
  await go(page, "#/next/search/o");
  const loadMore = page.getByRole("button", { name: "Load more" });
  await expect(loadMore).toBeVisible();
  await loadMore.focus();
  await page.keyboard.press("Enter");
  const fresh = page.locator('[data-media-card][href="#/next/item/m1-41"]');
  await expect(fresh).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/m1-41$/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/search\/o$/);
  await expect(fresh).toBeFocused();
});

test("Series: Back returns to the season that was shown and to the episode or its Details link", async ({ page }) => {
  await signIn(page);
  await go(page, "#/next/series/s1");
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Lights" })).toBeVisible();
  const season2 = page.getByRole("tab", { name: "Season 2" });
  await season2.click();
  await expect(season2).toHaveAttribute("aria-selected", "true");
  const episodes = page.locator(".ui-episode-row-link");
  await expect(episodes.first()).toBeVisible();
  await episodes.nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/ep-3/);
  await expect(page.locator("video")).toBeAttached({ timeout: 8_000 });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/series\/s1$/);
  await expect(page.getByRole("tab", { name: "Season 2" })).toHaveAttribute("aria-selected", "true");
  await expect(episodes.nth(2)).toBeFocused();

  const details = page.getByRole("link", { name: "Details for Fog Signal" });
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/ep-3$/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/series\/s1$/);
  await expect(details).toBeFocused();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`Episode detail at ${viewport.width}x${viewport.height}: the strip opens at the current episode and Back returns to a strip card`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    await go(page, "#/next/item/ep-5");
    const list = page.locator('[data-focus-row="More from Season 1"]');
    await expect(list.locator("[data-media-card]")).toHaveCount(5);
    const ep6 = itemCard(list, "ep-6");
    await expect(ep6).toHaveAttribute("tabindex", "0");
    expect(await list.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    const offsets = await page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('[data-focus-row="More from Season 1"]')!;
      const card = strip.querySelector<HTMLElement>('a[href="#/next/item/ep-6"]')!;
      return {
        gutter: parseFloat(getComputedStyle(strip).paddingInlineStart),
        left: card.getBoundingClientRect().left - strip.getBoundingClientRect().left,
        scrollLeft: strip.scrollLeft,
        maxScroll: strip.scrollWidth - strip.clientWidth,
      };
    });
    // Where the content is too short to scroll further, the card sits as near the gutter as the end allows.
    if (offsets.scrollLeft < offsets.maxScroll - 1) expect(Math.abs(offsets.left - offsets.gutter)).toBeLessThanOrEqual(offsets.gutter);

    await page.getByRole("link", { name: /^(Play|Resume)/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedId(page)).not.toBe("");
    for (let attempt = 0; attempt < 5 && (await focusedId(page)) !== "ep-6"; attempt += 1) await page.keyboard.press("ArrowRight");
    const chosen = await focusedId(page);
    expect(chosen).toMatch(/^ep-\d$/);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`#/next/item/${chosen}$`));
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/#\/next\/item\/ep-5$/);
    await expect(itemCard(list, chosen)).toBeFocused();
  });
}

test("Fallback: a card that is gone gives focus to the card now at its place", async ({ page }) => {
  const hidden = new Set<string>();
  await signIn(page, { hiddenFromLatest: hidden });
  const row = latestMovies(page);
  await row.getByRole("link").first().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(itemCard(row, "m5")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/m5$/);
  // Wait for the detail to load, so Home is gone and its rows are fetched afresh on the way back.
  await expect(page.getByRole("heading", { level: 1, name: "Glass Orchard" })).toBeVisible();
  // The next fetch of the row leaves m5 out.
  hidden.add("m5");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(itemCard(row, "m5")).toHaveCount(0);
  await expect(itemCard(row, "m6")).toBeFocused();
});

test("A fresh visit never restores: the nav's Home link is a new visit, and Back twice returns to the first one", async ({ page }) => {
  await signIn(page);
  const row = latestMovies(page);
  await row.getByRole("link").first().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/m4$/);
  await navLink(page, "Home").click();
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(itemCard(row, "m4")).toBeVisible();
  await expect(itemCard(row, "m4")).not.toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/#\/next\/item\/m4$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(itemCard(row, "m4")).toBeFocused();
});
