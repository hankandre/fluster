import { expect, test } from "@playwright/test";
import { mockPlayerServer } from "../support/player-server";
import { expectNoSmallText, expectTitleSafe, openArrivalTv } from "./support";

// Runs in the chromium-fake-hls project (playwright.config.ts matches /conversion\.spec\.ts/): the dev server
// built with the test-only HLS engine, so a converted session starts in the browser.
test("TV: a converted session shows its reason inside the safe area, and the chip sits in the top bar", async ({ page }) => {
  await mockPlayerServer(page, { converted: true, conversionReasons: "VideoCodecNotSupported" });
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/movie-1/);

  const message = page.getByRole("status", { name: "Player message" });
  await expect(message).toContainText("Converting on server: the video format is not supported here");
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  const pill = page.locator(".player-osd-pill");
  const box = await pill.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(54);
  expect(box!.x).toBeGreaterThanOrEqual(96);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1824);
  expect(await pill.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(24);

  // The chip is in the top bar once the chrome is woken, and Up from the scrubber reaches it.
  await page.keyboard.press("ArrowRight");
  const chip = page.locator(".player-top-bar .conversion-chip");
  await expect(chip).toContainText("Converting on server");
  await expectTitleSafe(page);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(chip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Player information" })).toContainText("the video format is not supported here");
  // Populated Video and Audio rows (E2eHlsEngine) at the TV type size, inside the safe area.
  const info = page.getByRole("region", { name: "Player information" });
  await expect(info.getByRole("heading", { name: "Video" })).toBeVisible();
  await expect(info.getByRole("heading", { name: "Audio" })).toBeVisible();
  await expect(info).toContainText("HEVC");
  await expect(info).toContainText("HDR (PQ)");
  await expect(info).toContainText("AAC");
  await expect(info).toContainText("Stereo · 48 kHz");
  await expect(info).toContainText("PCM, Stereo");
  await expectNoSmallText(page);
  await expectTitleSafe(page);
  // The body is a focus stop that scrolls with the arrow keys, so Renderer is reachable without a pointer.
  const body = info.getByRole("group", { name: "Details" });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(body).toBeFocused();
  await page.keyboard.press("End");
  await expect(info.getByRole("heading", { name: "Renderer" })).toBeInViewport();
  await page.keyboard.press("Home");
  await expect(info.getByRole("heading", { name: "Playback" })).toBeInViewport();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
});

test("TV: the track panel's two-line rows work with the remote inside the safe area", async ({ page }) => {
  const log = await mockPlayerServer(page, { converted: true, conversionReasons: "VideoCodecNotSupported", audioStreams: true });
  await openArrivalTv(page);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/movie-1/);
  await expect.poll(() => log.sequence).toContain("/Sessions/Playing play-1");

  // Wake the chrome, drop to the control row, and move Right to Audio & Subtitles.
  const tracks = page.getByRole("button", { name: "Audio & Subtitles" });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  for (let press = 0; press < 8 && !(await tracks.evaluate((element) => element === document.activeElement)); press += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(tracks).toBeFocused();
  await page.keyboard.press("Enter");

  const audio = page.getByRole("listbox", { name: "Audio track" });
  const english = audio.getByRole("option", { name: "English, AAC Stereo · default", exact: true });
  await expect(english).toBeFocused();
  await expect(english).toContainText("AAC Stereo · default");
  await expectNoSmallText(page);
  await expectTitleSafe(page);

  // Escape closes the sheet and returns focus to its trigger.
  await page.keyboard.press("Escape");
  await expect(page.locator(".player-sheet")).toBeHidden();
  await expect(tracks).toBeFocused();

  // Down moves between the two-line rows and Enter chooses.
  await page.keyboard.press("Enter");
  await expect(english).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(audio.getByRole("option", { name: "French, AC-3 5.1", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => log.playbackInfo.length).toBe(2);
});
