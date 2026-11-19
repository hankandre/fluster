import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

// P16-06: a genre in a title's facts line opens the library filtered to it.

async function signIn(page: Page, opts: MockOptions = {}): Promise<void> {
  await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

const go = (page: Page, hash: string) => page.evaluate((target) => { window.location.hash = target; }, hash);
const cards = (page: Page) => page.locator(".library-grid a.media-card");
const facts = (page: Page) => page.locator(".detail-facts");

test("film page: the Drama link opens the Movies library filtered to Drama, and another film opens from it", async ({ page }) => {
  await signIn(page);
  await go(page, "#/next/item/m1");
  await expect(page.getByRole("heading", { level: 1, name: "The Long Quiet" })).toBeFocused();
  await expect(facts(page)).toContainText("2023 · 2 h 3 min · 7.8 audience · 91% critics · Drama · Science Fiction");
  await facts(page).getByRole("link", { name: "Drama" }).click();

  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies\?genre=genre-drama&from=title$/);
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Genre Drama" })).toBeVisible();
  await expect(cards(page).first()).toBeVisible();
  const names = await cards(page).evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names)).toEqual(new Set(["#/next/item/m1", "#/next/item/m2", "#/next/item/m1-b", "#/next/item/m2-b", "#/next/item/m1-c", "#/next/item/m2-c"]));

  await cards(page).filter({ hasText: "Saltwater Hours" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Saltwater Hours" })).toBeVisible();
  await expect(page).toHaveURL(/#\/next\/item\/m2/);
});

test("Back from the filtered library returns to the film with focus on the genre link", async ({ page }) => {
  await signIn(page);
  await go(page, "#/next/item/m1");
  const drama = facts(page).getByRole("link", { name: "Drama" });
  await drama.click();
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies\?genre=genre-drama&from=title$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/next\/item\/m1$/);
  await expect(drama).toBeFocused();
});

test("series page: the Drama link opens the Shows library filtered to Drama, and another series opens from it", async ({ page }) => {
  await signIn(page);
  await go(page, "#/next/series/s1");
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Lights" })).toBeFocused();
  await facts(page).getByRole("link", { name: "Drama" }).click();

  await expect(page).toHaveURL(/#\/next\/browse\/lib-shows\?genre=genre-drama&from=title$/);
  await expect(page.getByRole("heading", { level: 1, name: "Shows" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Genre Drama" })).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
  await cards(page).filter({ hasText: "Quiet Orbit" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Quiet Orbit" })).toBeVisible();
});
