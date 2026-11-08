import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockServer, SERVER } from "./support/mock-server";

async function signIn(page: Page): Promise<void> {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

// Paint order cannot be seen from the DOM, so ask the browser what is on top at the element's centre.
async function paintsOnTop(locator: Locator): Promise<boolean> {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === element || element.contains(hit);
  });
}

test("the detail frame and content paint above the ambient backdrop", async ({ page }) => {
  await installMockServer(page);
  await signIn(page);
  await page.goto("/#/next/item/m1");
  const heading = page.getByRole("heading", { name: "Details" });
  await heading.waitFor();
  await page.getByRole("heading", { name: "The Long Quiet" }).waitFor();
  await expect(page.getByTestId("ambient-backdrop")).toBeAttached();
  // The layers ignore the pointer, so let them be hit to expose paint order.
  await page.addStyleTag({ content: ".ambient-layers, .ambient-layers * { pointer-events: auto !important; }" });
  expect(await paintsOnTop(heading)).toBe(true);
  expect(await paintsOnTop(page.getByRole("heading", { name: "The Long Quiet" }))).toBe(true);
  expect(await paintsOnTop(page.getByRole("link", { name: "Back to home" }))).toBe(true);
});
