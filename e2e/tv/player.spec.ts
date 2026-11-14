import { expect, test, type Page } from "@playwright/test";
import { mockPlayerServer } from "../support/player-server";
import { expectNoSmallText, expectTitleSafe, openArrivalTv, stubMedia, videoTime } from "./support";

const chrome = (page: import("@playwright/test").Page) => page.locator(".player-chrome");
const slider = (page: import("@playwright/test").Page) => page.getByRole("slider", { name: "Playback position" });

test("Player: arrows wake the chrome on the scrubber, zones move with Up and Down, sheets open and close, Escape leaves", async ({ page }) => {
  await mockPlayerServer(page);
  await stubMedia(page);
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/movie-1/);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(slider(page)).toBeEnabled();
  await expect(chrome(page)).toHaveAttribute("data-visible", "true");
  await expect(page.locator(".volume-group")).toBeHidden();
  await expect(page.getByRole("button", { name: /fullscreen/i })).toHaveCount(0);

  // A key keeps the chrome up for another idle period, then it hides and focus rests on the player.
  await page.keyboard.press("ArrowRight");
  await expect(slider(page)).toBeFocused();
  expect(await videoTime(page)).toBe(0);
  await expect(chrome(page)).toHaveAttribute("data-visible", "false", { timeout: 8_000 });
  await expect(page.getByRole("region", { name: "Player" })).toBeFocused();

  // OK with no prompt wakes the chrome with focus on Play or Pause.
  await page.keyboard.press("Enter");
  await expect(chrome(page)).toHaveAttribute("data-visible", "true");
  await expect(page.getByRole("button", { name: "Pause" })).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  const elapsed = await page.locator(".player-time").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(elapsed).toBeGreaterThanOrEqual(24);

  // Up reaches the scrubber, Right seeks +10 s there, Down returns to the control row.
  await page.keyboard.press("ArrowUp");
  await expect(slider(page)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => videoTime(page)).toBe(10);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Pause" })).toBeFocused();

  // Right to Audio & Subtitles, Enter opens the sheet, Escape closes it and returns focus to its trigger.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const tracks = page.getByRole("button", { name: "Audio & Subtitles" });
  await expect(tracks).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".player-sheet")).toBeVisible();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".player-sheet")).toBeHidden();
  await expect(tracks).toBeFocused();

  // Up, Up reaches the top bar; Escape leaves to the detail page.
  await page.keyboard.press("ArrowUp");
  await expect(slider(page)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
});

test("Player: the Info sheet opens from the control row with arrows and Enter, and Backspace leaves", async ({ page }) => {
  await mockPlayerServer(page);
  await stubMedia(page);
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  await expect(slider(page)).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Info" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Player information" })).toContainText("Direct play");
  // The browser engine reports no codec facts, so the rows read Unknown here; populated values are in conversion.spec.ts.
  const info = page.getByRole("region", { name: "Player information" });
  await expect(info.getByRole("heading", { name: "Video" })).toBeVisible();
  await expect(info.getByRole("heading", { name: "Audio" })).toBeVisible();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("region", { name: "Player information" })).toBeHidden();
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
});

const sliderValue = async (page: Page) => Number(await slider(page).inputValue());

// Plays Arrival, wakes the chrome onto the scrubber, and steps to 10 s with a press.
async function playToTenSeconds(page: Page): Promise<void> {
  await mockPlayerServer(page);
  await stubMedia(page);
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  await expect(slider(page)).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await expect(slider(page)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => videoTime(page)).toBe(10);
}

const isPaused = (page: Page) => page.locator("video").evaluate((video: HTMLVideoElement) => video.paused);

test("Player: a press steps 10 s; holding scrubs with the picture held; OK commits", async ({ page }) => {
  await playToTenSeconds(page);
  await page.keyboard.down("ArrowRight");
  await expect.poll(() => sliderValue(page), { timeout: 10_000 }).toBeGreaterThan(30);
  expect(await isPaused(page)).toBe(true);
  expect(await videoTime(page)).toBe(10);
  await page.keyboard.up("ArrowRight");
  const target = await sliderValue(page);
  expect(await videoTime(page)).toBe(10);
  await page.keyboard.press("Enter");
  await expect.poll(() => videoTime(page)).toBe(target);
  await expect.poll(() => isPaused(page)).toBe(false);
});

for (const back of ["Escape", "Backspace"]) {
  test(`Player: holding to scrub then ${back} returns to where playback was`, async ({ page }) => {
    await playToTenSeconds(page);
    await page.keyboard.down("ArrowRight");
    await expect.poll(() => sliderValue(page), { timeout: 10_000 }).toBeGreaterThan(30);
    await page.keyboard.up("ArrowRight");
    await page.keyboard.press(back);
    await expect.poll(() => sliderValue(page)).toBe(10);
    expect(await videoTime(page)).toBe(10);
    await expect.poll(() => isPaused(page)).toBe(false);
    await expect(page).toHaveURL(/#\/next\/play\//);
  });
}

test("Player: Up or Down shows the controls without pausing", async ({ page }) => {
  await playToTenSeconds(page);
  for (const arrow of ["ArrowUp", "ArrowDown"]) {
    await expect(chrome(page)).toHaveAttribute("data-visible", "false", { timeout: 8_000 });
    const before = await videoTime(page);
    await page.keyboard.press(arrow);
    await expect(chrome(page)).toHaveAttribute("data-visible", "true");
    expect(await isPaused(page)).toBe(false);
    expect(await videoTime(page)).toBe(before);
  }
});

test("Player: the Chapters sheet opens from the control row, Enter seeks and closes, Escape closes", async ({ page }) => {
  await mockPlayerServer(page, {
    chapters: [
      { StartPositionTicks: 0, Name: "Opening" },
      { StartPositionTicks: 300_000_000, Name: "Contact" },
      { StartPositionTicks: 900_000_000, Name: "Departure" },
    ],
  });
  await stubMedia(page);
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  await expect(slider(page)).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await expect(slider(page)).toBeFocused();
  // Down enters the control row on forward 10 (as the Info journey above relies on); Chapters is the next control.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Forward 10 seconds" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const chapters = page.getByRole("button", { name: "Chapters" });
  await expect(chapters).toBeFocused();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("region", { name: "Chapters" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("option", { name: /^Opening/ })).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  // Down to Contact, Enter seeks to 30 s, closes the sheet, and returns focus to Chapters.
  await page.keyboard.press("ArrowDown");
  await expect(sheet.getByRole("option", { name: /^Contact/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => videoTime(page)).toBe(30);
  await expect(sheet).toBeHidden();
  await expect(chapters).toBeFocused();

  // Escape on its own closes a reopened sheet and returns focus, without leaving the player.
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(chapters).toBeFocused();
  await expect(page).toHaveURL(/#\/next\/play\/movie-1/);
});

test("Player: OK skips a visible Skip while the chrome is hidden", async ({ page }) => {
  await mockPlayerServer(page, {
    hasSegments: true,
    segments: [{ Id: "seg-1", Type: "Intro", StartTicks: 100_000_000, EndTicks: 700_000_000 }],
  });
  await stubMedia(page);
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  await expect(slider(page)).toBeEnabled();
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.currentTime = 30;
    video.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.getByRole("button", { name: "Skip intro" })).toBeVisible();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  await page.keyboard.press("ArrowRight");
  await expect(chrome(page)).toHaveAttribute("data-visible", "false", { timeout: 8_000 });
  await page.keyboard.press("Enter");
  await expect.poll(() => videoTime(page)).toBe(70);
});

test("Playback notices: arrows reach Retry and Back to details; Escape leaves", async ({ page }) => {
  await mockPlayerServer(page, { disc: true });
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeFocused();
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Retry" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Back to details" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
});
