import { expect, test, type Page } from "@playwright/test";
import { expectBackClearOfTitle } from "./support/back-button";
import { installMockServer, SERVER } from "./support/mock-server";

// Owner decision 2026-11-19: the page Back button never covers the page title, on any non-root screen.

async function signIn(page: Page): Promise<void> {
  await installMockServer(page);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

const go = (page: Page, hash: string) => page.evaluate((target) => { window.location.hash = target; }, hash);

const SCREENS: [string, string][] = [
  ["collection", "#/next/collection/box-1"],
  ["series", "#/next/series/s1"],
  ["movie", "#/next/item/m1"],
  ["genre library opened from a title", "#/next/browse/lib-movies?genre=genre-drama&from=title"],
];

for (const [name, hash] of SCREENS) {
  test(`${name}: Back does not cover the title at 1440x900`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await go(page, hash);
    await expectBackClearOfTitle(page);
  });
}

test("a genre chosen in a nav library has no Back button, and one opened from a title keeps it across history", async ({ page }) => {
  await signIn(page);
  await go(page, "#/next/item/m1");
  await go(page, "#/next/browse/lib-movies");
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeVisible();
  await page.getByRole("button", { name: /^Genre/ }).click();
  await page.getByRole("option", { name: "Drama" }).click();
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies\?genre=genre-drama$/);
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

  await go(page, "#/next/item/m1");
  await page.locator(".detail-facts").getByRole("link", { name: "Drama" }).click();
  await expect(page).toHaveURL(/from=title$/);
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  // A history pop and return cannot lose it: the mark is in the route.
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/from=title$/);
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
});
