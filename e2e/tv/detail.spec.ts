import { expect, test, type Page } from "@playwright/test";
import { expectNoSmallText, expectTitleSafe, signInTv } from "./support";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
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
  await expect(page.locator(".detail-facts")).toContainText("7.8 audience · 91% critics");

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

test("Movie detail: Right reaches the audio sheet, Enter opens it inside the safe inset, Down and Enter choose, Escape closes", async ({ page }) => {
  await openDetail(page, "#/next/item/m1");
  await expect(play(page)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /^Version/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const audio = page.getByRole("button", { name: /^Audio/ });
  await expect(audio).toBeFocused();
  await page.keyboard.press("Enter");
  const list = page.getByRole("listbox");
  await expect(list).toHaveClass(/ui-picker-list--sheet/);
  await expectNoSmallText(page);
  await expectTitleSafe(page, "[role='listbox']");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(audio).toBeFocused();
  await expect(play(page)).toHaveAttribute("href", /&audio=2$/);
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(audio).toBeFocused();
  await expect(page).toHaveURL(/#\/next\/item\/m1$/);
});

test("Episode detail: Up reaches the series link, Down returns and enters the strip", async ({ page }) => {
  await openDetail(page, "#/next/item/ep-2");
  await expect(play(page)).toBeFocused();
  await expectNoSmallText(page);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("a.detail-series")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(play(page)).toBeFocused();
  // ArrowDown enters the strip only once its cards exist.
  const strip = page.locator(".media-row", { has: page.getByRole("heading", { name: /^More from/ }) });
  await expect(strip.locator(".media-card").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(strip.locator(".media-card:focus")).toHaveCount(1);
  await expectTitleSafe(page);
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("Movie detail: Up from Play reaches the genre row, Enter opens the filtered library, Back returns to the genre link", async ({ page }) => {
  await openDetail(page, "#/next/item/m1");
  await expect(play(page)).toBeFocused();
  await expectNoSmallText(page);
  await page.keyboard.press("ArrowUp");
  const drama = page.locator(".detail-facts").getByRole("link", { name: "Drama" });
  // Up lands on the genre link nearest Play's centre; Left and Right move along the row.
  await expect(page.locator(".detail-facts a:focus")).toHaveCount(1);
  await expectTitleSafe(page);
  const scienceFiction = page.locator(".detail-facts").getByRole("link", { name: "Science Fiction" });
  await page.keyboard.press("Home");
  await expect(drama).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(scienceFiction).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(drama).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies\?genre=genre-drama$/);
  await expect(page.getByRole("button", { name: "Genre Drama" })).toBeVisible();
  // The library is a root tab, so Escape focuses the nav's entry (as after See all on Home); history Back returns to the title.
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("link", { name: "Movies" })).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/#\/next\/item\/m1$/);
  await expect(drama).toBeFocused();
});

test("Movie detail: Down reaches Show all subtitles, Enter expands the list, Up returns to the action bar", async ({ page }) => {
  await signInTv(page, { manySubtitles: "default", subtitleLanguage: "eng" }, "#/next/item/m1");
  await expect(play(page)).toBeFocused({ timeout: 10_000 });
  const button = page.getByRole("button", { name: "Show all 52 subtitles" });
  await expect(button).toBeVisible();
  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press("ArrowDown");
    if (await button.evaluate((node) => node === document.activeElement)) break;
  }
  await expect(button).toBeFocused();
  await expectTitleSafe(page);
  await expectNoSmallText(page);
  await page.keyboard.press("Enter");
  const list = page.getByRole("list", { name: "All 52 subtitles" });
  await expect(list.locator("li")).toHaveCount(52);
  const fewer = page.getByRole("button", { name: "Show fewer subtitles" });
  await expect(fewer).toBeFocused();
  await expect(fewer).toHaveAttribute("aria-expanded", "true");
  await expectTitleSafe(page);
  await page.keyboard.press("Enter");
  await expect(button).toBeFocused();
  await expect(list).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(list.locator("li")).toHaveCount(52);
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press("ArrowUp");
    if (await page.evaluate(() => Boolean(document.activeElement?.closest('[role="group"][aria-label="Actions"]')))) break;
  }
  await expect(page.getByRole("group", { name: "Actions" }).locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
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
