import { expect, test, type Page } from "@playwright/test";
import { expectNoSmallText, expectTitleSafe, signInTv } from "./support";

// P16-02: the merged Continue watching row and the Home window setting, with arrows, Enter, and Escape only.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const firstCard = (page: Page) => page.locator(".home-rows [data-media-card]").first();

test("Home: Down from the hero reaches the merged Continue watching row, Enter plays its first card, Escape returns", async ({ page }) => {
  await signInTv(page, { agedOutFilm: true, finishOnStop: true, short: true, duration: 25 });
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Next up" })).toHaveCount(0);

  await page.keyboard.press("ArrowDown");
  await expect(firstCard(page)).toBeFocused();
  await expect(firstCard(page)).toHaveAttribute("aria-label", /S1 · E2/);
  await expectNoSmallText(page);
  await expectTitleSafe(page, ".home-rows");

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/ep-2/);
  await expect(page.locator("video")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/(home|item\/[^/]+)$/);
  if (/#\/next\/item\//.test(page.url())) await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
  // The finished episode left the row; the next one is first.
  await expect(firstCard(page)).toHaveAttribute("aria-label", /S1 · E3/);
  await expectTitleSafe(page, ".home-rows");
});

test("Settings: the Home section's Continue watching picker opens as a sheet and picks 7 days with the arrows", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");
  await expect(nav(page).getByRole("link", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/settings$/);

  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /^Local network maximum bitrate/ })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Playback" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Home" }).or(page.getByRole("button", { name: "Home" }))).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const picker = page.getByRole("button", { name: /^How long Continue watching keeps a title/ });
  await expect(picker).toBeFocused();
  await expect(picker).toHaveText(/14 days/);
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveClass(/ui-picker-list--sheet/);
  await expectTitleSafe(page, "[role='listbox']");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(picker).toBeFocused();
  await expect(picker).toHaveText(/7 days/);
  await expect(page.getByText("Continue watching keeps 7 days.")).toBeVisible();
  await expectTitleSafe(page);
});
