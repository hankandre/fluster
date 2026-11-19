import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER } from "./support/mock-server";

// Owner decision 2026-11-19: every non-root screen shows a round Back button at the top-left of the content.
// Through it, Back still restores the place (P13-31): focus returns to the card that was left.

async function signIn(page: Page): Promise<void> {
  await installMockServer(page);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

const latestMovies = (page: Page) => page.getByRole("region", { name: "Latest in Movies" });
const back = (page: Page) => page.getByRole("button", { name: "Back" });

async function openSecondCard(page: Page) {
  const row = latestMovies(page);
  await row.getByRole("link").first().focus();
  await page.keyboard.press("ArrowRight");
  const card = row.locator('a[href="#/next/item/m4"]');
  await expect(card).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/m4$/);
  return card;
}

test("a movie page has a Back button and a root screen has none", async ({ page }) => {
  await signIn(page);
  await expect(back(page)).toHaveCount(0);
  await openSecondCard(page);
  await expect(back(page)).toBeVisible();
  const box = await back(page).boundingBox();
  expect(box).not.toBeNull();
  // Under the nav bar, at the page gutter.
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(60);
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(24);
});

test("clicking Back returns Home with focus on the card that was left", async ({ page }) => {
  await signIn(page);
  const card = await openSecondCard(page);
  await back(page).click();
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport();
});

test("the keyboard reaches Back and Enter returns Home with focus on the card that was left", async ({ page }) => {
  await signIn(page);
  const card = await openSecondCard(page);
  // Back follows the nav in the Tab order, so Shift+Tab from the page heading reaches it.
  // Wait for the page's own opening focus on its heading first, so it cannot land after our Shift+Tab.
  const heading = page.getByRole("heading", { level: 1 }).first();
  await expect(heading).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(back(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(card).toBeFocused();
});
