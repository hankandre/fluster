import { expect, test } from "@playwright/test";

test("redirects signed-out visitors from Home to sign-in", async ({ page }) => {
  await page.goto("/#/next/home");
  await expect(page.getByLabel("Server URL")).toBeVisible();
  expect(page.url()).toContain("#/next/sign-in");
});
