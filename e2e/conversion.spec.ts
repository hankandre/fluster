import { expect, test } from "@playwright/test";
import { mockPlayerServer, openArrival } from "./support/player-server";

// Runs against the dev server built with the test-only HLS engine (see
// playwright.config.ts). The real browser engine still refuses HLS; its
// journeys are in player.spec.ts.
test("a direct stream shows the repackaging indicator and reports DirectStream", async ({ page }) => {
  const log = await mockPlayerServer(page, { converted: true, conversionReasons: "ContainerNotSupported" });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();

  await expect(page.locator(".conversion-chip")).toContainText("Repackaging on server, original quality: the file format is not supported here");
  await expect(page.locator(".conversion-chip")).not.toContainText("Subtitles are burned in");
  await expect.poll(() => log.reports.map((report) => report.path)).toContain("/Sessions/Playing");
  expect(log.reports.find((report) => report.path === "/Sessions/Playing")?.body).toMatchObject({ PlayMethod: "DirectStream" });
  await page.keyboard.press("i");
  await expect(page.getByRole("region", { name: "Player information" })).toContainText("Direct stream");

  await page.getByLabel("Back to library").click();
  await expect.poll(() => log.reports.map((report) => report.path)).toContain("/Sessions/Playing/Stopped");
  expect(log.reports.find((report) => report.path === "/Sessions/Playing/Stopped")?.body).toMatchObject({ PlayMethod: "DirectStream" });
});

test("a transcode with burned-in subtitles says so and reports Transcode", async ({ page }) => {
  const log = await mockPlayerServer(page, {
    converted: true,
    conversionReasons: "VideoCodecNotSupported",
    conversionQuery: "&SubtitleMethod=Encode",
  });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();

  const chip = page.locator(".conversion-chip");
  await expect(chip).toContainText("Converting on server: the video format is not supported here");
  await expect(chip).toContainText("Subtitles are burned in");
  await expect.poll(() => log.reports.map((report) => report.path)).toContain("/Sessions/Playing");
  expect(log.reports.find((report) => report.path === "/Sessions/Playing")?.body).toMatchObject({ PlayMethod: "Transcode" });

  await page.getByLabel("Back to library").click();
  await expect.poll(() => log.reports.map((report) => report.path)).toContain("/Sessions/Playing/Stopped");
  expect(log.reports.find((report) => report.path === "/Sessions/Playing/Stopped")?.body).toMatchObject({ PlayMethod: "Transcode" });
});

// P10-08: an audio stream the conversion does not carry starts a new
// conversion at the current position, after the old session is stopped.
test("choosing audio the conversion lacks renegotiates at the current position after stopping the old session", async ({ page }) => {
  const log = await mockPlayerServer(page, { converted: true, conversionReasons: "VideoCodecNotSupported", audioStreams: true });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();

  const audio = page.getByLabel("Audio track");
  await expect(audio).toHaveValue("1");
  await expect(audio.locator("option")).toHaveText(["English AAC", "French AC3"]);
  await expect.poll(() => log.sequence).toContain("/Sessions/Playing play-1");
  // Move to 0:10 so the new conversion has a position to continue from.
  await page.locator(".player-page").hover();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("0:10", { exact: true })).toBeVisible();

  await audio.selectOption("2");

  await expect.poll(() => log.playbackInfo.length).toBe(2);
  const query = log.playbackInfoQueries[1];
  expect(query.get("AudioStreamIndex")).toBe("2");
  expect(query.get("StartTimeTicks")).toBe("100000000");
  expect(log.playbackInfo[1]).toMatchObject({ AudioStreamIndex: 2, StartTimeTicks: 100_000_000, MediaSourceId: "src-hd" });
  // The old session's Stopped report and encode stop come before the new negotiation.
  const sequence = log.sequence.filter((entry) => !entry.startsWith("/Sessions/Playing/Progress"));
  expect(sequence.slice(0, 5)).toEqual([
    "PlaybackInfo play-1",
    "/Sessions/Playing play-1",
    "/Sessions/Playing/Stopped play-1",
    "DELETE ActiveEncodings play-1",
    "PlaybackInfo play-2",
  ]);
  expect(log.reports.find((report) => report.path === "/Sessions/Playing/Stopped")?.body).toMatchObject({ PlaySessionId: "play-1" });
  await expect(page.getByLabel("Audio track")).toHaveValue("2");
  await expect.poll(() => log.sequence).toContain("/Sessions/Playing play-2");
});
