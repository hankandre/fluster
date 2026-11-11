import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

// P13-10: the series page (DESIGN.md 7.6, 7.7, 7.11).

const RESUME_ROUTE = /#\/next\/play\/ep-2\?start=13200000000$/;

async function signIn(page: Page, opts: MockOptions = {}): Promise<void> {
  await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

test("the header plays the next episode in one activation", async ({ page }) => {
  await signIn(page);
  // The request is read from the page, so the mock needs no request log.
  const nextUp = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/Shows/NextUp" && url.searchParams.get("seriesId") === "s1";
  });
  await page.goto("/#/next/series/s1");

  await expect(page.getByRole("heading", { level: 1, name: "Harbor Lights" })).toBeFocused();
  await expect(page.getByText("2022–2024 · 2 seasons")).toBeVisible();
  const url = new URL((await nextUp).url());
  expect(url.searchParams.get("enableUserData")).toBe("true");

  await page.getByRole("link", { name: "Resume S1 · E2" }).click();
  await expect(page).toHaveURL(RESUME_ROUTE);
  await expect(page.locator("video")).toBeAttached({ timeout: 8_000 });
});

test("the header plays with the keyboard alone", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/next/series/s1");
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Lights" })).toBeFocused();
  // The primary is a skeleton until Next Up resolves; wait so the test checks the Tab order, not timing.
  const primary = page.getByRole("link", { name: "Resume S1 · E2" });
  await expect(primary).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(primary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(RESUME_ROUTE);
});

test("a fully watched series plays S1 · E1", async ({ page }) => {
  await signIn(page, { seriesNextUp: "none" });
  await page.goto("/#/next/series/s1");
  await expect(page.getByRole("link", { name: "Play S1 · E1" })).toHaveAttribute("href", "#/next/play/ep-1");
  await page.getByRole("link", { name: "Play S1 · E1" }).click();
  await expect(page).toHaveURL(/#\/next\/play\/ep-1$/);
});

test("seasons are tabs with Specials last and a visible selection", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/next/series/s1");
  const tabs = page.getByRole("tablist", { name: "Seasons" }).getByRole("tab");
  await expect(tabs).toHaveText(["Season 1", "Season 2", "Specials"]);
  const first = page.getByRole("tab", { name: "Season 1" });
  const second = page.getByRole("tab", { name: "Season 2" });
  await expect(first).toHaveAttribute("aria-selected", "true");

  const bar = (tab: typeof first) => tab.evaluate((node) => {
    const style = getComputedStyle(node, "::after");
    return { content: style.content, height: style.height };
  });
  expect(await bar(first)).toEqual({ content: '""', height: "2px" });
  expect((await bar(second)).content).toBe("none");

  const request = page.waitForRequest((r) => r.url().includes("/Shows/s1/Episodes") && r.url().includes("seasonId=se2"));
  await second.click();
  await request;
  await expect(second).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Specials" })).toHaveAttribute("aria-selected", "true");
});

test("a focused tab's ring stays inside the scrolling tab bar", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/next/series/s1");
  const tab = page.getByRole("tab", { name: "Season 1" });
  await page.keyboard.press("Shift");
  await tab.focus();
  await expect(tab).toBeFocused();
  const fits = await page.evaluate(() => {
    const ring = 4;
    const node = document.querySelector<HTMLElement>("[role=tab][aria-selected=true]")!;
    const bar = node.parentElement!.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return box.left - ring >= bar.left && box.right + ring <= bar.right && box.top - ring >= bar.top && box.bottom + ring <= bar.bottom;
  });
  expect(fits).toBe(true);
});

test("episode rows show their facts and play on Enter", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/next/series/s1");

  const landfall = page.getByRole("link", { name: "Landfall, Episode 1, watched" });
  await expect(landfall).toBeVisible();
  await expect(landfall).toContainText("1 · Landfall");
  await expect(landfall).toContainText("45 min");
  await expect(landfall).toContainText("The keeper's daughter finds a ledger");
  const keeper = page.getByRole("link", { name: "The Keeper's Log, Episode 2, 23 minutes left" });
  await expect(keeper).toContainText("23 min left");

  const fog = page.getByRole("link", { name: "Fog Signal, Episode 3" });
  await fog.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/ep-3$/);

  await page.goBack();
  await page.getByRole("link", { name: "Details for Fog Signal" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/ep-3$/);

  await page.goBack();
  const firstRow = page.getByRole("link", { name: "Landfall, Episode 1, watched" });
  await firstRow.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("tab", { name: "Season 1" })).toBeFocused();
});

test("a missing series shows a notice with Go home", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/next/series/nope");
  await expect(page.getByRole("heading", { level: 1, name: "This item is no longer on the server" })).toBeFocused();
  await page.getByRole("link", { name: "Go home" }).click();
  await expect(page).toHaveURL(/#\/next\/home$/);
});
