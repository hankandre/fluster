import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockServer, SERVER } from "./support/mock-server";

// DESIGN.md §9: every focusable element shows the two-tone ring. --focus is #fff4dc.
const FOCUS_RGB = "rgb(255, 244, 220)";

async function signIn(page: Page): Promise<void> {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

// Focus after a key press so :focus-visible applies, as it does for keyboard users.
async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await page.keyboard.press("Shift");
  await target.focus();
  await expect(target).toBeFocused();
}

async function ring(target: Locator): Promise<{ boxShadow: string; outlineStyle: string; outlineWidth: string; outlineColor: string }> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor };
  });
}

test("a focused input and button show the focus ring", async ({ page }) => {
  await installMockServer(page);
  await page.goto("/#/next/sign-in");
  const input = page.getByLabel("Server URL");
  await focusByKeyboard(page, input);
  expect((await ring(input)).boxShadow).toContain(FOCUS_RGB);
  const button = page.getByRole("button", { name: "Connect" });
  await focusByKeyboard(page, button);
  expect((await ring(button)).boxShadow).toContain(FOCUS_RGB);
});

test("a focused select and media card show the focus ring", async ({ page }) => {
  await installMockServer(page);
  await signIn(page);
  const card = page.locator("a.media-card").first();
  await focusByKeyboard(page, card);
  // The ring fades in with the frame transition, so wait for it.
  await expect.poll(async () => (await ring(card.locator(".media-card-frame"))).boxShadow).toContain(FOCUS_RGB);
  await page.goto("/#/next/browse/lib-movies");
  const select = page.getByLabel("Sort by");
  await focusByKeyboard(page, select);
  expect((await ring(select)).boxShadow).toContain(FOCUS_RGB);
});

test("forced colours keep a visible outline on focus", async ({ page }) => {
  await installMockServer(page);
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/#/next/sign-in");
  const input = page.getByLabel("Server URL");
  await focusByKeyboard(page, input);
  const { outlineStyle, outlineWidth, outlineColor } = await ring(input);
  expect(outlineStyle).toBe("solid");
  expect(outlineWidth).toBe("3px");
  expect(outlineColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("forced colours draw one ring on a focused card, on its frame", async ({ page }) => {
  await installMockServer(page);
  await page.emulateMedia({ forcedColors: "active" });
  await signIn(page);
  const card = page.locator("a.media-card").first();
  await focusByKeyboard(page, card);
  expect((await ring(card)).outlineStyle).toBe("none");
  const frame = await ring(card.locator(".media-card-frame"));
  expect(frame.outlineStyle).toBe("solid");
  expect(frame.outlineColor).not.toBe("rgba(0, 0, 0, 0)");
});
