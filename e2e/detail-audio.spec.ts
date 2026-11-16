import { expect, test } from "@playwright/test";
import { mockPlayerServer, openArrival } from "./support/player-server";

// P17-08: a viewer picks the audio track on the title's page and plays with it. Runs against the dev server
// built with the test-only HLS engine (see playwright.config.ts), because the pick is carried by a conversion
// here; the browser-engine journeys are in player.spec.ts.
test("the audio pick, chosen with the keyboard alone, plays and is selected in the player", async ({ page }) => {
  const log = await mockPlayerServer(page, { converted: true, conversionReasons: "VideoCodecNotSupported", audioStreams: true });
  await openArrival(page);

  const trigger = page.getByRole("button", { name: /^Audio/ });
  await expect(trigger).toContainText("English");
  const play = page.getByRole("link", { name: "Play" });
  await expect(play).toHaveAttribute("href", "#/next/play/movie-1?source=src-hd");
  await play.focus();
  await page.keyboard.press("ArrowRight");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const list = page.getByRole("listbox", { name: /Audio/ });
  await expect(list).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("French");
  await expect(play).toHaveAttribute("href", "#/next/play/movie-1?source=src-hd&audio=2");

  await play.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/next\/play\/movie-1\?source=src-hd&audio=2$/);

  // The first negotiation carries the pick in body and query, with the chosen version in the body.
  await expect.poll(() => log.playbackInfo.length).toBeGreaterThan(0);
  expect(log.playbackInfo[0]).toMatchObject({ AudioStreamIndex: 2, MediaSourceId: "src-hd" });
  expect(log.playbackInfoQueries[0].get("AudioStreamIndex")).toBe("2");
  // The conversion is shown as for any conversion.
  await expect(page.locator(".conversion-chip")).toContainText("Converting on server: the video format is not supported here");
  // The audio list shows the pick selected.
  await page.keyboard.press("a");
  const audio = page.getByRole("listbox", { name: "Audio track" });
  await expect(audio.getByRole("option", { name: /^French/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  // The start report names the track's Jellyfin index.
  await expect.poll(() => log.reports.map((report) => report.path)).toContain("/Sessions/Playing");
  expect(log.reports.find((report) => report.path === "/Sessions/Playing")?.body).toMatchObject({ AudioStreamIndex: 2 });

  // Back from the player keeps the pick on the page.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("button", { name: /^Audio/ })).toContainText("French");
  await expect(page.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/movie-1?source=src-hd&audio=2");

  // Leaving for Home and coming back forgets it.
  await page.getByRole("link", { name: "Home" }).first().click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await page.getByRole("link", { name: "Arrival, 2016" }).click();
  await expect(page.getByRole("button", { name: /^Audio/ })).toContainText("English");
  await expect(page.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/movie-1?source=src-hd");
});

test("with no pick the first negotiation names no audio track", async ({ page }) => {
  const log = await mockPlayerServer(page, { converted: true, conversionReasons: "VideoCodecNotSupported", audioStreams: true });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(1);
  expect(log.playbackInfo[0]).not.toHaveProperty("AudioStreamIndex");
  expect(log.playbackInfoQueries[0].has("AudioStreamIndex")).toBe(false);
});
