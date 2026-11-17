import { expect, test, type Page } from "@playwright/test";
import { expectNoSmallText, expectTitleSafe, signInTv } from "./support";

// P3-24 in the TV form: arrows, Enter, and Escape reach the Intros and Credits rows and their Pickers.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("Playback: arrows reach Intros, a choice saves, and Escape closes the Picker without changing it", async ({ page }) => {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");
  await expect(nav(page).getByRole("link", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Playback" })).toBeVisible();

  // Down enters the rows: the two limits, then Intros.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /^Local network maximum bitrate/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /^Remote maximum bitrate/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const intros = page.getByRole("button", { name: /^What happens at an intro/ });
  await expect(intros).toBeFocused();
  await expect(intros).toHaveText("Show a Skip button");
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  // Escape closes an open Picker and keeps the value.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expectTitleSafe(page, "[role='listbox']");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(intros).toHaveText("Show a Skip button");
  await expect(intros).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Skip automatically" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(intros).toHaveText("Skip automatically");
  await expect(page.getByText("Intros: Skip automatically.")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /^What happens at the credits/ })).toBeFocused();
});
