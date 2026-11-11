import { expect, test, type Page } from "@playwright/test";
import { mockPlayerServer, serverUrl } from "./support/player-server";

// P13-08: Resume from Home takes one activation (DESIGN.md 13.1).

const START = "#/next/play/movie-1?start=600000000";

async function signInToHome(page: Page) {
  // Every hash the page visits, so "one activation" is observable as a single route change.
  await page.addInitScript(() => {
    const visited: string[] = [];
    (window as unknown as { __hashes: string[] }).__hashes = visited;
    window.addEventListener("hashchange", () => visited.push(window.location.hash));
  });
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  await expect(page).toHaveURL(/#\/next\/home$/);
}

const visitedHashes = (page: Page) => page.evaluate(() => [...(window as unknown as { __hashes: string[] }).__hashes]);
const forgetHashes = (page: Page) => page.evaluate(() => { (window as unknown as { __hashes: string[] }).__hashes.length = 0; });

function resumeCard(page: Page) {
  return page.getByRole("region", { name: "Continue watching" }).getByRole("link");
}

test("Enter on a Continue watching card plays it in one activation", async ({ page }) => {
  const log = await mockPlayerServer(page, { homeResume: true, resumeTicks: 600_000_000 });
  await signInToHome(page);

  const card = resumeCard(page);
  await expect(card).toHaveCount(1);
  await card.focus();
  await forgetHashes(page);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`${START.replace(/[?]/g, "\\?")}$`));
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => log.reports.map((report) => report.path)).toContain("/Sessions/Playing");
  expect(log.playbackInfo).toHaveLength(1);
  expect(log.playbackInfo[0]).toMatchObject({ StartTimeTicks: 600_000_000 });
  // One press moved Home straight to the player, with no details route in between.
  expect(await visitedHashes(page)).toEqual([START]);
});

test("the hero's Resume plays in one activation", async ({ page }) => {
  const log = await mockPlayerServer(page, { homeResume: true, resumeTicks: 600_000_000 });
  await signInToHome(page);

  const hero = page.getByRole("region", { name: "Arrival" });
  await forgetHashes(page);
  await hero.getByRole("link", { name: /^Resume from/ }).click();

  await expect(page).toHaveURL(new RegExp(`${START.replace(/[?]/g, "\\?")}$`));
  await expect.poll(() => log.reports.map((report) => report.path)).toContain("/Sessions/Playing");
  expect(log.playbackInfo).toHaveLength(1);
  expect(log.playbackInfo[0]).toMatchObject({ StartTimeTicks: 600_000_000 });
  expect(await visitedHashes(page)).toEqual([START]);
});

test("i opens details", async ({ page }) => {
  const log = await mockPlayerServer(page, { homeResume: true, resumeTicks: 600_000_000 });
  await signInToHome(page);

  await resumeCard(page).focus();
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  expect(log.playbackInfo).toHaveLength(0);
});

test("Back from the player returns to Home", async ({ page }) => {
  await mockPlayerServer(page, { homeResume: true, resumeTicks: 600_000_000 });
  await signInToHome(page);

  await resumeCard(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("video")).toHaveCount(1);
  await page.getByLabel("Back to library").click();
  await expect(page).toHaveURL(/#\/next\/home$/);
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
});
