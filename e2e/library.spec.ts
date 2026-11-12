import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

// P13-11: library browsing (DESIGN.md 7.12).

async function signIn(page: Page, opts: MockOptions = {}): Promise<void> {
  await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

async function openMovies(page: Page, opts: MockOptions = {}): Promise<void> {
  await signIn(page, opts);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Movies" }).click();
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies$/);
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeFocused();
}

const libraryRequests = (page: Page): URL[] => {
  const urls: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/Items" && url.searchParams.get("parentId")) urls.push(url);
  });
  return urls;
};

const status = (page: Page) => page.locator("[role=status].visually-hidden");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Sort and filter" });
const cards = (page: Page) => page.locator(".library-grid a.media-card");

test("the library name is the h1 over a toolbar with sort, three chips, and the count", async ({ page }) => {
  await signIn(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Movies" }).click();
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies$/);
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeFocused();
  await expect(toolbar(page)).toBeVisible();
  await expect(toolbar(page).getByRole("button", { name: "Sort Name A to Z" })).toBeVisible();
  for (const name of ["Unwatched", "Favorites", "In progress"]) {
    await expect(toolbar(page).getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(toolbar(page).getByText("18 items")).toBeVisible();
});

test("sort is chosen from the keyboard and restarts at the first page", async ({ page }) => {
  const requests = libraryRequests(page);
  await openMovies(page);
  await expect(cards(page).first()).toBeVisible();
  await page.keyboard.press("Tab");
  const trigger = page.getByRole("button", { name: /^Sort/ });
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("listbox").waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Sort Newest added first" })).toBeFocused();
  await expect.poll(() => requests.some((url) => url.searchParams.get("sortBy") === "DateCreated"
    && url.searchParams.get("sortOrder") === "Descending" && url.searchParams.get("startIndex") === "0")).toBe(true);
});

test("filter chips toggle from the keyboard, send the filter, and update the count", async ({ page }) => {
  const requests = libraryRequests(page);
  await openMovies(page);
  await expect(toolbar(page).getByText("18 items")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowRight");
  const unwatched = page.getByRole("button", { name: "Unwatched" });
  await expect(unwatched).toBeFocused();
  await page.keyboard.press(" ");
  await expect(unwatched).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => requests.some((url) => url.searchParams.get("filters") === "IsUnplayed")).toBe(true);
  // The default mock list holds 18 movies, 3 of them played.
  await expect(toolbar(page).getByText("15 items")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Favorites" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => requests.some((url) => url.searchParams.get("filters") === "IsUnplayed,IsFavorite")).toBe(true);
});

test("filters that match nothing show the empty state, and Clear filters resets them", async ({ page }) => {
  await openMovies(page);
  // The default mock fixture guarantees an empty intersection: no movie is both a favourite and resumable.
  await page.getByRole("button", { name: "In progress" }).click();
  await page.getByRole("button", { name: "Favorites" }).click();
  await expect(page.getByRole("heading", { name: "Nothing matches these filters" })).toBeVisible();
  const clear = page.getByRole("button", { name: "Clear filters" });
  await clear.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Unwatched" })).toBeFocused();
  for (const name of ["Unwatched", "Favorites", "In progress"]) {
    await expect(page.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(cards(page).first()).toBeVisible();
});

test("pages load by themselves as the end nears the viewport", async ({ page }) => {
  const requests = libraryRequests(page);
  await openMovies(page, { bigLibrary: true });
  await expect(toolbar(page).getByText("150 items")).toBeVisible();
  await expect(cards(page).first()).toBeVisible();
  // No click: scrolling to the end is all it takes. The window may already be tall enough to chain pages.
  await expect.poll(async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    return cards(page).count();
  }, { timeout: 15_000 }).toBe(150);
  await expect(status(page)).toHaveText("30 more items loaded");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  const starts = requests.map((url) => url.searchParams.get("startIndex"));
  expect(starts).toContain("60");
  expect(starts).toContain("120");
});

test("Load more is the keyboard fallback and moves focus to the first new card", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined;
  });
  await openMovies(page, { bigLibrary: true });
  await expect(cards(page)).toHaveCount(60);
  await cards(page).first().focus();
  await page.keyboard.press("End");
  await expect(cards(page).nth(59)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const more = page.getByRole("button", { name: "Load more" });
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("60 more items loaded");
  await expect(cards(page)).toHaveCount(120);
  await expect(cards(page).nth(60)).toBeFocused();
});

test("a failed later page keeps the cards, stops auto loading, and recovers on Retry", async ({ page }) => {
  const opts: MockOptions = { bigLibrary: true, libraryPageError: true };
  const requests = libraryRequests(page);
  await openMovies(page, opts);
  await expect(cards(page)).toHaveCount(60);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByText("Couldn't load more items.")).toBeVisible({ timeout: 10_000 });
  await expect(cards(page)).toHaveCount(60);
  const failed = requests.filter((url) => url.searchParams.get("startIndex") === "60").length;
  await page.waitForTimeout(1_500);
  expect(requests.filter((url) => url.searchParams.get("startIndex") === "60")).toHaveLength(failed);

  opts.libraryPageError = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(cards(page)).toHaveCount(120);
  await expect(page.getByText("Couldn't load more items.")).toHaveCount(0);
});

test("the toolbar sticks under the nav and follows it when it hides", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await openMovies(page, { bigLibrary: true });
  // A sync point only: auto paging may already have added the second page on this short window.
  await expect.poll(() => cards(page).count()).toBeGreaterThanOrEqual(60);
  const bar = page.locator(".ui-toolbar-wrap");
  const top = () => bar.evaluate((element) => element.getBoundingClientRect().top);
  const navBottom = () => page.getByRole("banner").evaluate((element) => element.getBoundingClientRect().bottom);

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.evaluate(() => window.scrollBy(0, -20));
  await expect.poll(async () => Math.abs((await top()) - (await navBottom())) <= 1).toBe(true);

  await page.evaluate(() => window.scrollBy(0, 400));
  await expect(page.getByRole("banner")).toHaveAttribute("data-hidden", "true");
  await expect.poll(async () => Math.abs(await top()) <= 1).toBe(true);

  const bottom = await bar.evaluate((element) => element.getBoundingClientRect().bottom);
  await cards(page).nth(30).focus();
  await expect.poll(() => cards(page).nth(30).evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(bottom - 1);
});

test("the removed Libraries page is Not found, and a collection is titled by its name", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/next/browse");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await page.goto("/#/next/collection/box-1");
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Collection" })).toBeVisible();
  await expect(cards(page).first()).toBeVisible();
});

test("See all ends a Latest row and opens the library by date added", async ({ page }) => {
  const requests = libraryRequests(page);
  await signIn(page);
  const latest = page.getByRole("region", { name: "Latest in Movies" });
  const last = latest.locator("a.media-card").last();
  await expect(last).toBeVisible();
  await last.focus();
  await page.keyboard.press("ArrowRight");
  const tile = latest.getByRole("link", { name: "See all in Movies" });
  await expect(tile).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies\?sort=added-desc$/);
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Sort Newest added first" })).toBeVisible();
  await expect.poll(() => requests.some((url) => url.searchParams.get("sortBy") === "DateCreated"
    && url.searchParams.get("sortOrder") === "Descending")).toBe(true);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Movies" })).toHaveAttribute("aria-current", "page");
});

