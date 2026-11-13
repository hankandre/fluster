import { expect, test, type Page } from "@playwright/test";
import { LAN, SERVER } from "../support/mock-server";
import { expectNoSmallText, expectTitleSafe, openTv } from "./support";
import { installMockServer } from "../support/mock-server";

// Sign-in in the TV form with the keyboard only: the on-screen keyboard types with insertText.

const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };

async function mockPasswordServer(page: Page, origin: string) {
  await page.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify(body) });
    switch (path) {
      case "/System/Info/Public":
        return json({ ServerName: "Testfin", Version: "10.11.7", Id: "server-1" });
      case "/QuickConnect/Enabled":
        return json(true);
      case "/QuickConnect/Initiate":
        return json({ Secret: "e2e-secret", Code: "482913", Authenticated: false });
      case "/QuickConnect/Connect":
        return json({ Secret: "e2e-secret", Code: "482913", Authenticated: false });
      case "/Users/AuthenticateByName":
        return json({ AccessToken: "test-token", User: { Id: "user-1", Name: "Tester" } });
      default:
        return route.fulfill({ status: 404, headers });
    }
  });
}

test("address, then Quick Connect, lands on Home with focus on the hero", async ({ page }) => {
  await installMockServer(page);
  await openTv(page, "#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  await page.keyboard.insertText(SERVER);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Approve this code in Jellyfin" })).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
  await expect(page.locator(".hero-actions a").first()).toBeFocused({ timeout: 10_000 });
});

test("address, Use password, then username and password sign in; Backspace deletes in a field", async ({ page }) => {
  await mockPasswordServer(page, SERVER);
  await openTv(page, "#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.keyboard.insertText(SERVER);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Approve this code in Jellyfin" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Change server" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Use password" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Username")).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  await page.keyboard.insertText("Louisee");
  await page.keyboard.press("Backspace");
  await expect(page.getByLabel("Username")).toHaveValue("Louise");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.insertText("secret");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/home$/, { timeout: 10_000 });
});

test("Escape on the password step returns to the server step", async ({ page }) => {
  await mockPasswordServer(page, SERVER);
  await openTv(page, "#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.keyboard.insertText(SERVER);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Approve this code in Jellyfin" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Username")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Change server" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Server URL")).toBeVisible();
});

test("a private LAN address asks first; arrows and Enter pick Connect without encryption", async ({ page }) => {
  await mockPasswordServer(page, LAN);
  await openTv(page, "#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.keyboard.insertText(LAN);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page, "[role='alertdialog']");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("button", { name: "Connect without encryption" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Approve this code in Jellyfin" })).toBeVisible();
});

test("Backspace closes the unencrypted dialog", async ({ page }) => {
  await mockPasswordServer(page, LAN);
  await openTv(page, "#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.keyboard.insertText(LAN);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("alertdialog")).toBeHidden();
});
