import { expect, test, type Page } from "@playwright/test";
import { startArrival } from "./support/player-server";

// Owner report, 2026-11-19: a player sheet opened with the mouse must close on Escape, and (owner decision, same
// day) a press on the video outside it closes it and does nothing else. DESIGN.md 7.14 and 9.
const sheets = [
  { button: "Info", region: "Player information" },
  { button: "Audio & Subtitles", region: "Audio and subtitles" },
  { button: "Settings", region: "Player settings" },
];

const paused = (page: Page) => page.locator("video").evaluate((element: HTMLVideoElement) => element.paused);

async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startArrival(page, true);
  await expect.poll(() => paused(page)).toBe(false);
  await expect(page.getByRole("button", { name: "Info" })).toBeVisible();
}

for (const sheet of sheets) {
  test(`desktop: Escape closes ${sheet.button} opened by a click, and the player stays`, async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: sheet.button }).click();
    await expect(page.getByRole("region", { name: sheet.region })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: sheet.region })).toHaveCount(0);
    await expect(page).toHaveURL(/#\/next\/play\//);
    expect(await paused(page)).toBe(false);
  });

  test(`desktop: a click on the video closes ${sheet.button} and playback carries on`, async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: sheet.button }).click();
    await expect(page.getByRole("region", { name: sheet.region })).toBeVisible();
    await page.mouse.click(480, 420);
    await expect(page.getByRole("region", { name: sheet.region })).toHaveCount(0);
    expect(await paused(page)).toBe(false);
    await expect(page).toHaveURL(/#\/next\/play\//);
  });
}

test("desktop: with a sheet open, Pause in the control row pauses and the sheet stays", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Audio & Subtitles" }).click();
  await expect(page.getByRole("region", { name: "Audio and subtitles" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect.poll(() => paused(page)).toBe(true);
  await expect(page.getByRole("region", { name: "Audio and subtitles" })).toBeVisible();
  await page.getByRole("button", { name: "Audio & Subtitles" }).click();
  await expect(page.getByRole("region", { name: "Audio and subtitles" })).toHaveCount(0);
});

test("desktop: a click on empty space in the control row closes the sheet like the video", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Info" }).click();
  await expect(page.getByRole("region", { name: "Player information" })).toBeVisible();
  const box = await page.locator(".player-controls").boundingBox();
  if (!box) throw new Error("no control row");
  await page.mouse.click(box.x + 2, box.y + 2);
  await expect(page.getByRole("region", { name: "Player information" })).toHaveCount(0);
  expect(await paused(page)).toBe(false);
});
