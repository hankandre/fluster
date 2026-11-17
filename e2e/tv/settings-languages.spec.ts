import { expect, test, type Page } from "@playwright/test";
import { expectNoSmallText, expectTitleSafe, signInTv } from "./support";

// P17-03 in the TV form: arrows, Enter, and Escape reach the Languages rows and the sheet.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("Languages: arrows reach the audio row, its sheet fits the title-safe area, and Escape focuses the nav", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");
  await expect(nav(page).getByRole("link", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  // Focus starts at the top of the panel: Down reaches the first row, Left the section's tab.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Playback" }).or(page.getByRole("button", { name: "Playback" }))).toBeFocused();
  for (const name of ["Home", "Languages"]) {
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("tab", { name }).or(page.getByRole("button", { name }))).toBeFocused();
  }
  await expect(page.getByRole("heading", { level: 2, name: "Languages" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  const audio = page.getByRole("button", { name: /^Audio language/ });
  await expect(audio).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveClass(/ui-picker-list--sheet/);
  await expectTitleSafe(page, "[role='listbox']");
  await expectNoSmallText(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Original language" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(audio).toHaveText("Original language");
  await expectTitleSafe(page);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(audio).toHaveText("Original language");

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Languages" }).or(page.getByRole("button", { name: "Languages" }))).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("link", { name: "Settings" })).toBeFocused();
});
