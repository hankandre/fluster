import { expect, test } from "@playwright/test";
import { mockPlayerServer } from "../support/player-server";
import { expectNoSmallText, expectTitleSafe, openArrivalTv } from "./support";

// Runs in the chromium-fake-hls project (playwright.config.ts matches /conversion\.spec\.ts/): the dev server
// built with the test-only HLS engine, so a converted session starts in the browser.
test("TV: a converted session shows its reason inside the safe area, and the chip sits in the top bar", async ({ page }) => {
  await mockPlayerServer(page, { converted: true, conversionReasons: "VideoCodecNotSupported" });
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/movie-1/);

  const message = page.getByRole("status", { name: "Player message" });
  await expect(message).toContainText("Converting on server: the video format is not supported here");
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  const pill = page.locator(".player-osd-pill");
  const box = await pill.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(54);
  expect(box!.x).toBeGreaterThanOrEqual(96);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1824);
  expect(await pill.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(22);

  // The chip is in the top bar once the chrome is woken, and Up from the scrubber reaches it.
  await page.keyboard.press("ArrowRight");
  const chip = page.locator(".player-top-bar .conversion-chip");
  await expect(chip).toContainText("Converting on server");
  await expectTitleSafe(page);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(chip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Player information" })).toContainText("the video format is not supported here");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
});
