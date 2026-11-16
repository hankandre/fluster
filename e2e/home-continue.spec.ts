import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

// P16-02: Home leads with what the viewer is watching now (DESIGN.md 7.3, 7.4).

async function signIn(page: Page, opts: MockOptions = {}): Promise<void> {
  await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

const continueRow = (page: Page) => page.getByRole("region", { name: "Continue watching" });
const cardLinks = (page: Page) => continueRow(page).locator("a.media-card");

test("finishing an episode puts the next episode first on Home and makes it the hero", async ({ page }) => {
  // Without the film, the in-progress episode (S1 E2) leads the row and the hero.
  await signIn(page, { agedOutFilm: true, finishOnStop: true, short: true, duration: 25 });
  await expect(cardLinks(page).first()).toHaveAttribute("aria-label", /S1 · E2/);
  const hero = page.getByRole("region", { name: "Harbor Lights" });
  await expect(hero.getByRole("link", { name: /^Resume from/ })).toBeVisible();

  await cardLinks(page).first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/ep-2/);
  await expect(page.locator("video")).toHaveCount(1);
  await page.getByRole("button", { name: "Back", exact: true }).click();

  await expect(page).toHaveURL(/#\/next\/home$/);
  // The finished episode is gone; the next one leads the row and is the hero.
  await expect(cardLinks(page).first()).toHaveAttribute("aria-label", /S1 · E3/);
  await expect(hero.getByRole("link", { name: "Play S1 · E3" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next up" })).toHaveCount(0);
});

test("an item last played 30 days ago is out of Continue watching and still resumes from its own page", async ({ page }) => {
  await signIn(page, { agedOutFilm: true });
  await expect(cardLinks(page).first()).toBeVisible();
  await expect(continueRow(page).getByRole("link", { name: /Saltwater Hours/ })).toHaveCount(0);
  // It is not the hero either.
  await expect(page.getByRole("region", { name: "Saltwater Hours" })).toHaveCount(0);

  await page.evaluate(() => { window.location.hash = "#/next/item/m2"; });
  await expect(page.getByRole("link", { name: /^Resume from/ })).toBeVisible();
});

test("a shorter window in Settings drops a title from the row on the next visit to Home", async ({ page }) => {
  await signIn(page);
  // Quiet Orbit's series was last finished 9 days ago: inside the default 14 days.
  await expect(continueRow(page).getByRole("link", { name: /Quiet Orbit/ })).toBeVisible();

  await page.evaluate(() => { window.location.hash = "#/next/settings"; });
  await page.getByRole("tab", { name: "Home" }).click();
  await page.getByRole("button", { name: /^How long Continue watching keeps a title/ }).click();
  await page.getByRole("option", { name: "7 days" }).click();
  await expect(page.getByText("Continue watching keeps 7 days.")).toBeVisible();

  await page.evaluate(() => { window.location.hash = "#/next/home"; });
  await expect(cardLinks(page).first()).toBeVisible();
  await expect(continueRow(page).getByRole("link", { name: /Quiet Orbit/ })).toHaveCount(0);
});
