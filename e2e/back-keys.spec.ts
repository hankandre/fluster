import { expect, test, type Page } from "@playwright/test";
import { installMockServer, LAN, SERVER } from "./support/mock-server";
import { mockPlayerServer } from "./support/player-server";

// DESIGN.md 9: Backspace and Escape are Back on the desktop form too.

async function signIn(page: Page): Promise<void> {
  await installMockServer(page);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

async function openItem(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => { window.location.hash = target; }, hash);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("Backspace and Escape go back from item detail", async ({ page }) => {
  await signIn(page);
  await openItem(page, "#/next/item/m1");
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/home$/);
  await openItem(page, "#/next/item/m1");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("Escape goes back from a series and from a collection, and a root tab stays put", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { window.location.hash = "#/next/series/s1"; });
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Lights" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
  await page.evaluate(() => { window.location.hash = "#/next/collection/box-1"; });
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Collection" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("Backspace closes the version picker before it goes back", async ({ page }) => {
  await signIn(page);
  await openItem(page, "#/next/item/m1");
  await page.getByRole("button", { name: /^Version/ }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(page).toHaveURL(/#\/next\/item\/m1$/);
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/home$/);
});

test("Backspace deletes a character in the search field and does not go back", async ({ page }) => {
  await signIn(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Search" }).click();
  const field = page.getByRole("combobox");
  await field.fill("abc");
  await page.keyboard.press("Backspace");
  await expect(field).toHaveValue("ab");
  await expect(page).toHaveURL(/#\/next\/search$/);
});

test("Up from Home's first row reaches the nav and Down returns", async ({ page }) => {
  await signIn(page);
  const primary = page.locator(".hero-actions a").first();
  await primary.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(primary).toBeFocused();
});

test("Backspace in the player leaves to the detail page", async ({ page }) => {
  await mockPlayerServer(page);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill("http://127.0.0.1:8096");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  await page.getByRole("link", { name: "Arrival, 2016" }).click();
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
});

test("Backspace closes the unencrypted-connection dialog", async ({ page }) => {
  const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
  await page.route(`${LAN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/System/Info/Public") {
      return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify({ ServerName: "Testfin", Version: "10.11.7", Id: "server-1" }) });
    }
    return route.fulfill({ status: 404, headers });
  });
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(LAN);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("alertdialog")).toBeHidden();
});
