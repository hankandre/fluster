import { expect, test } from "@playwright/test";
import { expectBackClearOfTitle } from "../support/back-button";
import { SAFE_X, signInTv } from "./support";

// Owner decision 2026-11-19: Up from the page's first control reaches the Back button, then the nav; Enter goes back.

test("Movie detail: Up from Play reaches the genre links, then Back, then the nav; Enter on Back returns Home", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.evaluate(() => { window.location.hash = "#/next/item/m1"; });
  const play = page.getByRole("link", { name: /^(Play|Resume)/ });
  await expect(play).toBeFocused();
  const back = page.getByRole("button", { name: "Back" });
  // The genre links on the facts line sit above Play; Up reaches them first, then Back.
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".detail-genre-link:focus")).toHaveCount(1);
  await page.keyboard.press("ArrowUp");
  await expect(back).toBeFocused();
  const box = await back.boundingBox();
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(SAFE_X - 1);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("navigation", { name: "Main" }).locator("[data-roving-item][tabindex='0']")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(back).toBeFocused();
  // Down from Back enters the page's first row; Up returns to Back.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".detail-genre-link:focus")).toHaveCount(1);
  await page.keyboard.press("ArrowUp");
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("TV: Back does not cover the title on the collection, series, movie, and genre library screens", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  for (const hash of ["#/next/collection/box-1", "#/next/series/s1", "#/next/item/m1", "#/next/browse/lib-movies?genre=genre-drama&from=title"]) {
    await page.evaluate((target) => { window.location.hash = target; }, hash);
    await expectBackClearOfTitle(page);
  }
});
