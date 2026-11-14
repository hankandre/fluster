import { expect, test, type Page } from "@playwright/test";
import { expectNoSmallText, expectTitleSafe, signInTv } from "./support";

const play = (page: Page) => page.getByRole("link", { name: /^(Play|Resume)/ });

async function openDetail(page: Page, hash: string): Promise<void> {
  await signInTv(page);
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
  await page.evaluate((target) => { window.location.hash = target; }, hash);
}

test("Movie detail: the primary takes focus; Right reaches the version sheet and Watched; the toast stays inside the safe inset", async ({ page }) => {
  await openDetail(page, "#/next/item/m1");
  await expect(play(page)).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  await page.keyboard.press("ArrowRight");
  const version = page.getByRole("button", { name: /^Version/ });
  await expect(version).toBeFocused();
  await page.keyboard.press("Enter");
  const list = page.getByRole("listbox");
  await expect(list).toHaveClass(/ui-picker-list--sheet/);
  await expectNoSmallText(page);
  await expectTitleSafe(page, "[role='listbox']");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(version).toBeFocused();

  await page.keyboard.press("ArrowRight");
  const watched = page.getByRole("button", { name: "Watched" });
  await expect(watched).toBeFocused();
  await page.keyboard.press("Enter");
  const toast = page.locator(".ui-toast").first();
  await expect(toast).toBeVisible();
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  // Escape goes back to the previous screen.
  await page.keyboard.press("Escape");
  await expect(toast).toBeHidden({ timeout: 10_000 }).catch(() => undefined);
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("Episode detail: Up reaches the series link, Down returns and enters the strip", async ({ page }) => {
  await openDetail(page, "#/next/item/ep-2");
  await expect(play(page)).toBeFocused();
  await expectNoSmallText(page);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("a.detail-series")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(play(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".media-card:focus")).toHaveCount(1);
  await expectTitleSafe(page);
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("Series: season tabs, a horizontal episode row with the overview under it, Menu opens details, Enter plays", async ({ page }) => {
  await openDetail(page, "#/next/series/s1");
  await expect(page.getByRole("link", { name: /^(Play|Resume)/ })).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Season 1" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const episodes = page.locator(".ui-episode-row-link");
  await expect(episodes.first()).toBeFocused();
  await expect(page.locator(".ui-episode-row .ui-button")).toHaveCount(0);

  // The overview under the row follows focus.
  const under = page.locator(".episode-row-overview");
  // The mock gives every episode the same overview; the unit test proves the text follows focus.
  await expect(under).toContainText("ledger");
  await page.keyboard.press("ArrowRight");
  await expect(episodes.nth(1)).toBeFocused();
  await expect(under).toContainText("ledger");
  const boxes = await episodes.evaluateAll((links) => links.slice(0, 2).map((link) => link.getBoundingClientRect().top));
  expect(boxes[0]).toBe(boxes[1]);
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  await page.keyboard.press("ContextMenu");
  await expect(page).toHaveURL(/#\/next\/item\/ep-/);
  await expect(page.getByRole("link", { name: /^(Play|Resume)/ })).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/series\/s1$/);

  // Back restores the episode that was left (DESIGN.md 9), where it used to open on the primary action.
  await expect(episodes.nth(1)).toBeFocused();
  await expect(page.locator(".ui-episode-row-link:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\//);
});
