import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER } from "./support/mock-server";

// DESIGN.md 7.1: the app nav is one Tab stop after the skip link, and works from the keyboard alone.

async function signIn(page: Page): Promise<void> {
  await installMockServer(page);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Shows" })).toBeVisible();
}

// From a fresh Home load: the skip link, then the Home entry, which is current.
async function tabToHomeEntry(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const home = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" });
  await expect(home).toBeFocused();
  await expect(home).toHaveAttribute("aria-current", "page");
}

test("Tab reaches the skip link then the nav, and Enter opens a library", async ({ page }) => {
  await signIn(page);
  await tabToHomeEntry(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("link", { name: "Movies" }).first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/browse\/lib-movies$/);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Movies" })).toHaveAttribute("aria-current", "page");
});

test("the nav reaches Search with the arrow keys", async ({ page }) => {
  await signIn(page);
  await tabToHomeEntry(page);
  for (let step = 0; step < 3; step += 1) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Search" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/search$/);
});

test("the nav reaches Settings with End", async ({ page }) => {
  await signIn(page);
  await tabToHomeEntry(page);
  await page.keyboard.press("End");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/settings$/);
});

test("the skip link focuses the page without changing the route", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page).toHaveURL(/#\/next\/home$/);
});

for (const hash of ["#/next/home", "#/next/browse/lib-movies", "#/next/search", "#/next/settings"]) {
  test(`Escape leaves ${hash} where it is`, async ({ page }) => {
    await signIn(page);
    await page.evaluate((target) => { window.location.hash = target; }, hash);
    await expect(page).toHaveURL(new RegExp(`${hash.replace(/\//g, "\\/")}$`));
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`${hash.replace(/\//g, "\\/")}$`));
  });
}

test("reduced motion removes nav transforms and transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await tabToHomeEntry(page);
  const style = await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).evaluate((element) => {
    const computed = getComputedStyle(element);
    return { transform: computed.transform, duration: computed.transitionDuration };
  });
  expect(style.transform).toBe("none");
  for (const duration of style.duration.split(",")) expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.00001 + 0.01 / 1000);
});
