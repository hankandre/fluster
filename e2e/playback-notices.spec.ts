import { expect, test } from "@playwright/test";
import { DESKTOP_ONLY_COPY, REFUSAL_COPY } from "../src/features/player/refusal-copy";
import { mockPlayerServer, openArrival } from "./support/player-server";

test.use({ viewport: { width: 1440, height: 900 } });

test("every refusal title fits in two lines at 1440 px", async ({ page }) => {
  await mockPlayerServer(page, { disc: true });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(heading).toHaveCSS("font-size", "32px");
  await expect(heading).toHaveCSS("font-weight", "650");

  const titles = [...Object.values(REFUSAL_COPY).map((copy) => copy.title), DESKTOP_ONLY_COPY.title];
  for (const title of titles) {
    const lines = await heading.evaluate((element, text) => {
      element.textContent = text;
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      return Math.round(element.getBoundingClientRect().height / lineHeight);
    }, title);
    expect(lines, title).toBeLessThanOrEqual(2);
  }
});

test("keyboard: heading, Retry, Back to details", async ({ page }) => {
  await mockPlayerServer(page, { disc: true });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Retry" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Back to details" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
});

test("the refusal draws over the item's dimmed backdrop", async ({ page }) => {
  await mockPlayerServer(page, { disc: true });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".playback-notice-art img")).toBeAttached();
  await expect(page.locator(".playback-notice-art")).toHaveCSS("opacity", "0.3");
  await expect(page.locator(".ui-notice-context")).toHaveText("Arrival");
});
