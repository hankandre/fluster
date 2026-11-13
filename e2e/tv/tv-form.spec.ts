import { expect, test } from "@playwright/test";
import { installMockServer } from "../support/mock-server";
import { expectNoSmallText, openTv, signInTv } from "./support";

// DESIGN.md 6: the 10-foot form, turned on in browser development by ?form=tv.

test("?form=tv sets the TV form and a 24 px root; no flag leaves it unset", async ({ page }) => {
  await installMockServer(page);
  await openTv(page, "#/next/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-form", "tv");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("24px");

  await page.goto("/#/next/sign-in");
  await expect(page.locator("html")).not.toHaveAttribute("data-form", /.*/);
});

test("the TV form hides pointer affordances and keeps text at 24 px or more", async ({ page }) => {
  await signInTv(page, { longRows: true });
  await page.getByRole("heading", { name: "Home" }).waitFor();
  await expect(page.locator(".media-row-page").first()).toBeHidden();
  await expectNoSmallText(page);
});

test("the TV form sets body text to 28 px and still fits six posters across the safe width", async ({ page }) => {
  await signInTv(page);
  await page.evaluate(() => { window.location.hash = "#/next/item/m1"; });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBeCloseTo(28, 1);
  const fits = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const poster = parseFloat(root.getPropertyValue("--poster-w"));
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-4")) || 0;
    return { poster, total: poster * 6 + gap * 5, safe: window.innerWidth - 2 * parseFloat(root.getPropertyValue("--safe-x")) };
  });
  expect(fits.poster).toBe(248);
  expect(fits.total).toBeLessThanOrEqual(fits.safe);
});
