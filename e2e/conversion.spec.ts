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
  expect(log.requestUrls.filter((url) => /m3u8|e2e-key/i.test(url))).toEqual([]);
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
