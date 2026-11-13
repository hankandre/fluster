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

test("the TV form hides pointer affordances and keeps text at 22 px or more", async ({ page }) => {
  await signInTv(page, { longRows: true });
  await page.getByRole("heading", { name: "Home" }).waitFor();
  await expect(page.locator(".media-row-page").first()).toBeHidden();
  await expectNoSmallText(page);
});
