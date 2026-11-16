import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

// P17-02: File and streams lists the viewer's subtitle language and expands with the keyboard alone.

async function openMovie(page: Page, id: string, opts: MockOptions): Promise<void> {
  await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
  await page.evaluate((target) => { window.location.hash = target; }, `#/next/item/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /^(Play|Resume)/ })).toBeVisible();
}

const hdrInfo = (page: Page) => page.getByRole("region", { name: "Media info for 4K HDR" });
const subtitleItems = (page: Page) => hdrInfo(page).getByText("Subtitles", { exact: true }).locator("xpath=following-sibling::dd[1]").locator("li");

test("the viewer's language is listed first, and arrows and Enter expand the full list", async ({ page }) => {
  await openMovie(page, "m1", { manySubtitles: "default", subtitleLanguage: "eng" });
  const button = hdrInfo(page).getByRole("button", { name: "Show all 52 subtitles" });
  await expect(button).toBeVisible();
  await expect(subtitleItems(page)).toHaveCount(3);
  await expect(subtitleItems(page).filter({ hasText: "default" })).toHaveCount(1);
  await expect(subtitleItems(page).filter({ hasText: "forced" })).toHaveCount(1);

  await page.getByRole("link", { name: /^(Play|Resume)/ }).focus();
  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press("ArrowDown");
    if (await button.evaluate((node) => node === document.activeElement)) break;
  }
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(subtitleItems(page)).toHaveCount(52);
  const fewer = hdrInfo(page).getByRole("button", { name: "Show fewer subtitles" });
  await expect(fewer).toBeFocused();
  await expect(fewer).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Enter");
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(subtitleItems(page)).toHaveCount(3);
  await page.keyboard.press("Enter");
  await expect(subtitleItems(page)).toHaveCount(52);

  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press("ArrowUp");
    if (await page.evaluate(() => Boolean(document.activeElement?.closest('[role="group"][aria-label="Actions"]')))) break;
  }
  await expect(page.getByRole("group", { name: "Actions" }).locator(":focus")).toHaveCount(1);
});

test("with no language set, the default track and a count of the rest are listed", async ({ page }) => {
  await openMovie(page, "m1", { manySubtitles: "default" });
  await expect(hdrInfo(page).getByText("English · SRT · default")).toBeVisible();
  await expect(hdrInfo(page).getByText("51 more in 32 languages")).toBeVisible();
  await expect(hdrInfo(page).getByRole("button", { name: "Show all 52 subtitles" })).toBeVisible();
  await expect(subtitleItems(page)).toHaveCount(1);
});

test("with no default track, only the count is listed", async ({ page }) => {
  await openMovie(page, "m1", { manySubtitles: "no-default" });
  await expect(hdrInfo(page).getByText("52 in 32 languages")).toBeVisible();
  await expect(subtitleItems(page)).toHaveCount(0);
  await expect(hdrInfo(page).getByRole("button", { name: "Show all 52 subtitles" })).toBeVisible();
});

test("only the first title has the 52 tracks; the second keeps its two", async ({ page }) => {
  await openMovie(page, "m2", { manySubtitles: "default" });
  await expect(hdrInfo(page).getByText("1 more in 1 language")).toBeVisible();
  const button = hdrInfo(page).getByRole("button", { name: "Show all 2 subtitles" });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(subtitleItems(page)).toHaveCount(2);
});

test("a title with one subtitle track lists it with no count and no button", async ({ page }) => {
  await openMovie(page, "m4", {});
  const info = page.getByRole("region", { name: /^Media info for/ });
  await expect(info.getByText("English · SRT")).toBeVisible();
  await expect(info.getByRole("button")).toHaveCount(0);
  await expect(info.getByText(/language/)).toHaveCount(0);
});
