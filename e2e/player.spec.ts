import { expect, test, type Page } from "@playwright/test";
import { mockPlayerServer, openArrival, type ServerLog } from "./support/player-server";

// The decision 0002 flags, in the body and in the query string. EnableDirectPlay
// is false only on the forced-fallback request for a disc.
function expectFallbackFlags(log: ServerLog, index: number, enableDirectPlay = true) {
  const flags = {
    EnableDirectPlay: enableDirectPlay,
    EnableDirectStream: true,
    EnableTranscoding: true,
    AllowVideoStreamCopy: true,
    AllowAudioStreamCopy: true,
    AutoOpenLiveStream: false,
  };
  expect(log.playbackInfo[index]).toMatchObject({ ...flags, AlwaysBurnInSubtitleWhenTranscoding: false });
  const query = log.playbackInfoQueries[index];
  for (const [name, value] of Object.entries(flags)) expect(query.get(name), name).toBe(String(value));
}

function reportPaths(log: ServerLog): string[] {
  return log.reports.map((report) => report.path);
}

test("Play opens the player and Back returns to the detail view", async ({ page }) => {
  const log = await mockPlayerServer(page);
  await openArrival(page);

  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/#\/next\/play\/movie-1\?source=src-hd$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");
  expect(log.playbackInfo).toHaveLength(1);
  expect(log.playbackInfo[0]).toMatchObject({ MediaSourceId: "src-hd", StartTimeTicks: 0 });
  expectFallbackFlags(log, 0);
  // Direct play shows no conversion indicator, and the report names its method.
  await expect(page.locator(".conversion-chip")).toHaveCount(0);
  // The movie has no chapters, so the control row has no Chapters button.
  await expect(page.getByRole("button", { name: "Info" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chapters" })).toHaveCount(0);
  expect(log.reports.find((report) => report.path === "/Sessions/Playing")?.body).toMatchObject({ PlayMethod: "DirectPlay" });
  await page.keyboard.press("i");
  await expect(page.getByRole("region", { name: "Player information" })).toContainText("Direct play");

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  // Back went back through history instead of adding a second detail entry.
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing/Stopped");
  const stopped = log.reports.find((report) => report.path === "/Sessions/Playing/Stopped");
  expect(stopped?.body).toMatchObject({ Failed: false, PlaySessionId: "play-1", MediaSourceId: "src-hd" });
});

test("Back does not wait for a slow Jellyfin progress report, and Stopped is still sent", async ({ page }) => {
  const log = await mockPlayerServer(page, { holdReports: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/, { timeout: 1_000 });
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible({ timeout: 1_000 });
  expect(reportPaths(log)).not.toContain("/Sessions/Playing/Stopped");

  log.releaseReports();
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing/Stopped");
});

test("never puts a token in a request URL, including the stream", async ({ page }) => {
  const log = await mockPlayerServer(page);
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await page.keyboard.press("i");
  await expect(page.getByRole("region", { name: "Player information" }).getByText("Browser — unverified").first()).toBeVisible();
  await expect.poll(() => log.requestUrls.some((url) => new URL(url).pathname === "/Videos/movie-1/stream")).toBe(true);
  expect(log.requestUrls.filter((url) => /api_?key|access_token|token/i.test(url))).toEqual([]);
});

test("Resume starts at the saved position and the end of the file returns to the detail view", async ({ page }) => {
  const log = await mockPlayerServer(page, { resumeTicks: 7_540_000_000 });
  await openArrival(page);

  await expect(page.getByRole("link", { name: "Start over" })).toBeVisible();
  await page.getByRole("link", { name: "Resume from 12:34" }).click();
  await expect(page).toHaveURL(/#\/next\/play\/movie-1/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await expect.poll(() => log.playbackInfo.length).toBe(1);
  expect(log.playbackInfo[0]).toMatchObject({ StartTimeTicks: 7_540_000_000, MediaSourceId: "src-hd" });
  expectFallbackFlags(log, 0);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");

  await page.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));

  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing/Stopped");
});

test("Retry after a playback error renegotiates, and Back returns to the detail view", async ({ page }) => {
  const log = await mockPlayerServer(page, { failPlayback: true, resumeTicks: 4_200_000_000 });
  await openArrival(page);

  await page.getByRole("link", { name: "Resume from 7:00" }).click();
  await expect(page.getByRole("heading", { name: "Playback could not start" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(2);
  expect(log.playbackInfo[0]).toMatchObject({ StartTimeTicks: 4_200_000_000 });
  expect(log.playbackInfo[1]).toMatchObject({ StartTimeTicks: 4_200_000_000 });
  expectFallbackFlags(log, 0);
  expectFallbackFlags(log, 1);
  expect(log.playbackInfo[1]).toMatchObject({ MediaSourceId: "src-hd" });
  await expect.poll(() => (
    log.reports.filter((report) => report.path === "/Sessions/Playing/Stopped").map((report) => report.body.Failed)
  )).toContain(true);

  await page.getByRole("button", { name: "Back to details" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
});

test("Retry after a failure mid-item resumes where it stopped, with the same request otherwise", async ({ page }) => {
  const log = await mockPlayerServer(page);
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");
  // Mocked media never advances, so fix the position the player reports.
  await page.locator("video").evaluate((video) => {
    Object.defineProperty(video, "currentTime", { configurable: true, get: () => 75, set: () => undefined });
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("error"));
  });
  await expect(page.getByRole("heading", { name: "Playback could not start" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(2);

  expect(log.playbackInfo[1]).toMatchObject({ StartTimeTicks: 750_000_000 });
  expect(log.playbackInfoQueries[1].get("StartTimeTicks")).toBe("750000000");
  expectFallbackFlags(log, 0);
  expectFallbackFlags(log, 1);
  const { StartTimeTicks: _first, ...firstBody } = log.playbackInfo[0];
  const { StartTimeTicks: _retried, ...retriedBody } = log.playbackInfo[1];
  expect(retriedBody).toEqual(firstBody);
  await expect.poll(() => (
    log.reports.find((report) => report.path === "/Sessions/Playing/Stopped")?.body
  )).toMatchObject({ Failed: true, PlaySessionId: "play-1", PositionTicks: 750_000_000 });
});

test("a Blu-ray folder offered for direct play is asked for once more without it, then explained", async ({ page }) => {
  const log = await mockPlayerServer(page, { disc: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  const heading = page.getByRole("heading", { name: "The server won’t convert this file for your account" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Allow video playback that requires transcoding");
  await expect(alert).toContainText("Allow audio playback that requires transcoding");
  await expect(alert).toContainText("Allow video playback that requires conversion without re-encoding");
  await expect(alert).not.toContainText("won’t ask the server");
  await expect(page.getByRole("button", { name: "Back to details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /anyway/i })).toHaveCount(0);
  await expect(page.getByText(/convert (it )?anyway|transcode anyway/i)).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(log.reports).toHaveLength(0);
  // The disc is never requested as a static file.
  expect(log.requestUrls.filter((url) => /\/stream|Static=true/i.test(url))).toEqual([]);
  expect(log.playbackInfo).toHaveLength(2);
  expectFallbackFlags(log, 0);
  expectFallbackFlags(log, 1, false);
  expect(log.playbackInfo[1]).toMatchObject({ MediaSourceId: "src-disc" });

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(4);
  await expect(heading).toBeVisible();
  expectFallbackFlags(log, 3, false);

  await page.getByRole("button", { name: "Back to details" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
});

test("a server that won't convert for this account names the setting, and Retry plays once it is lifted", async ({ page }) => {
  const log = await mockPlayerServer(page, { noDirectPlayAnswers: 1 });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "The server won’t convert this file for your account" })).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("Ask the server admin");
  await expect(page.getByRole("button", { name: /anyway/i })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(2);
  expect(log.playbackInfo[1]).toMatchObject({ MediaSourceId: "src-hd" });
  expectFallbackFlags(log, 1);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
});

// Decision 0002: the browser development engine never plays HLS (I7); P10-10
// shows the desktop-only screen.
test("a converted stream is not played by the browser engine and never requested", async ({ page }) => {
  const log = await mockPlayerServer(page, { converted: true });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  const heading = page.getByRole("heading", { name: "This stream needs the desktop player" });
  await expect(heading).toBeFocused();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(log.requestUrls.filter((url) => /m3u8|e2e-key/i.test(url))).toEqual([]);

  await page.getByRole("button", { name: "Back to details" }).click();
  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
});

// The browser engine cannot play HLS (I7), so the indicator itself is covered
// by player-view.test.tsx and the reports by gateway.test.ts. These journeys
// check what the browser can reach: the server's conversion answer is
// accepted as a conversion, nothing is played, reported, or requested, and no
// indicator claims a conversion that is not running.
for (const [name, reasons] of [
  ["direct stream", "ContainerNotSupported"],
  ["transcode", "VideoCodecNotSupported"],
] as const) {
  test(`a ${name} answer is refused by the browser engine without an indicator or a report`, async ({ page }) => {
    const log = await mockPlayerServer(page, { converted: true, conversionReasons: reasons });
    await openArrival(page);

    await page.getByRole("link", { name: "Play" }).click();
    await expect(page.getByRole("heading", { name: "This stream needs the desktop player" })).toBeVisible();
    await expect(page.locator(".conversion-chip")).toHaveCount(0);
    await expect(page.locator("video")).toHaveCount(0);
    expect(log.playbackInfo).toHaveLength(1);
    expect(log.reports).toEqual([]);
    expect(log.requestUrls.filter((url) => /m3u8|e2e-key/i.test(url))).toEqual([]);
  });
}

test("Back cancels an in-flight playback negotiation", async ({ page }) => {
  const log = await mockPlayerServer(page, { playbackDelayMs: 300 });
  await openArrival(page);

  await page.getByRole("link", { name: "Play" }).click();
  await expect.poll(() => log.playbackInfo.length).toBe(1);
  await page.getByRole("button", { name: "Back", exact: true }).click();

  await expect(page).toHaveURL(/#\/next\/item\/movie-1$/);
  await page.waitForTimeout(450);
  // The detail page has its own level 1 "Arrival", so assert directly that the player never mounted.
  await expect(page.locator(".player-page")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(log.playbackInfo).toHaveLength(1);
  expect(log.reports).toHaveLength(0);
});

const introAndOutro = [
  { Id: "seg-1", Type: "Intro", StartTicks: 100_000_000, EndTicks: 700_000_000 },
  { Id: "seg-2", Type: "Outro", StartTicks: 1_000_000_000, EndTicks: 1_190_000_000 },
];

async function moveTo(page: Page, seconds: number) {
  await page.locator("video").evaluate((video: HTMLVideoElement, position) => {
    video.currentTime = position;
    video.dispatchEvent(new Event("timeupdate"));
  }, seconds);
}

test("skip buttons appear inside the intro and the credits and seek to the segment end", async ({ page }) => {
  const log = await mockPlayerServer(page, { hasSegments: true, segments: introAndOutro });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);

  await expect.poll(() => log.segmentRequests.length).toBe(1);
  expect(log.segmentRequests[0].search).toBe("?includeSegmentTypes=Intro&includeSegmentTypes=Outro");
  expect(log.segmentRequests[0].authorization).toMatch(/^MediaBrowser /);

  await moveTo(page, 5);
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);

  await moveTo(page, 30);
  const skipIntro = page.getByRole("button", { name: "Skip intro" });
  await expect(skipIntro).toBeVisible();
  await expect(skipIntro).not.toBeFocused();
  await skipIntro.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(70);
  // A real media element reports the new position itself; the stub does not.
  await page.locator("video").dispatchEvent("timeupdate");
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);

  await moveTo(page, 105);
  await expect(page.getByRole("button", { name: "Skip credits" })).toBeVisible();
  await moveTo(page, 118.5);
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);
});

function startWithSegments(page: Page) {
  return startArrival(page, true, { hasSegments: true, segments: introAndOutro });
}

const currentTime = (page: Page) => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime);

async function hideChrome(page: Page) {
  await page.mouse.move(5, 5);
  await page.mouse.move(8, 8);
  await expect(page.locator(".player-chrome")).toHaveAttribute("data-visible", "false", { timeout: 6_000 });
}

test("s skips the intro", async ({ page }) => {
  await startWithSegments(page);
  await moveTo(page, 30);
  await expect(page.getByRole("button", { name: "Skip intro" })).toBeVisible();
  await page.keyboard.press("s");
  await expect.poll(() => currentTime(page)).toBe(70);
});

test("Skip sits above the scrubber with the chrome up and lower once it hides", async ({ page }) => {
  await startWithSegments(page);
  await moveTo(page, 30);
  const skip = page.getByRole("button", { name: "Skip intro" });
  await expect(skip).toBeVisible();
  await page.mouse.move(700, 400);
  await page.mouse.move(720, 410);
  await expect(page.locator(".player-chrome")).toHaveAttribute("data-visible", "true");

  const slider = page.getByRole("slider", { name: "Playback position" });
  await expect.poll(async () => {
    const [skipBox, sliderBox] = await Promise.all([skip.boundingBox(), slider.boundingBox()]);
    return skipBox && sliderBox ? sliderBox.y - (skipBox.y + skipBox.height) : -1;
  }).toBeGreaterThan(0);
  const raised = await skip.boundingBox();

  await hideChrome(page);
  await expect.poll(async () => (await skip.boundingBox())?.y ?? 0).toBeGreaterThan((raised?.y ?? 0) + 20);
});

test("on the TV form OK skips while the chrome is hidden; on desktop it does nothing", async ({ page }) => {
  await startWithSegments(page);
  await moveTo(page, 30);
  await expect(page.getByRole("button", { name: "Skip intro" })).toBeVisible();
  await hideChrome(page);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  expect(await currentTime(page)).toBe(30);

  await page.evaluate(() => { document.documentElement.dataset.form = "tv"; });
  await page.keyboard.press("Enter");
  await expect.poll(() => currentTime(page)).toBe(70);
});

test("a version without segments never asks for them and shows no skip button", async ({ page }) => {
  const log = await mockPlayerServer(page, { hasSegments: false, segments: introAndOutro });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => reportPaths(log)).toContain("/Sessions/Playing");

  await moveTo(page, 30);
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);
  expect(log.segmentRequests).toHaveLength(0);
});

test("empty segment data hides the skip feature", async ({ page }) => {
  const log = await mockPlayerServer(page, { hasSegments: true, segments: [] });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect.poll(() => log.segmentRequests.length).toBe(1);

  await moveTo(page, 30);
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);
});

test("the Info panel toggles with its button and the i key and shows no ids or URLs", async ({ page }) => {
  await mockPlayerServer(page);
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);

  const button = page.getByRole("button", { name: "Info" });
  const panel = page.getByLabel("Player information");
  await expect(panel).toBeHidden();
  await button.click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Browser — unverified");
  await expect(panel).toContainText("Direct play");
  const text = (await panel.textContent()) ?? "";
  expect(text).not.toContain("play-1");
  expect(text).not.toContain("://");
  expect(text).not.toContain("src-hd");

  await page.locator("body").press("i");
  await expect(panel).toBeHidden();
  await page.locator("body").press("i");
  await expect(panel).toBeVisible();
});

// trackPaused makes the file-less <video> remember pause and play, as keyboard.spec.ts does.
async function startArrival(page: Page, trackPaused = false, serverOptions: Parameters<typeof mockPlayerServer>[1] = {}) {
  await mockPlayerServer(page, serverOptions);
  if (trackPaused) {
    await page.addInitScript(() => {
      const paused = new WeakMap<HTMLMediaElement, boolean>();
      Object.defineProperty(HTMLMediaElement.prototype, "paused", {
        configurable: true,
        get(this: HTMLMediaElement) {
          return paused.get(this) ?? true;
        },
      });
      HTMLMediaElement.prototype.play = function play() {
        paused.set(this, false);
        queueMicrotask(() => {
          this.dispatchEvent(new Event("loadedmetadata"));
          this.dispatchEvent(new Event("play"));
          this.dispatchEvent(new Event("playing"));
        });
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function pause() {
        paused.set(this, true);
        this.dispatchEvent(new Event("pause"));
      };
      // The empty stream body cannot decode; keep that error from the engine.
      window.addEventListener("error", (event) => {
        if (event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
      }, true);
    });
  }
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
}

test("keys show on-screen feedback, and Home, End, and the digits jump", async ({ page }) => {
  await startArrival(page);
  const osd = page.getByRole("status", { name: "Player message" });
  const currentTime = () => page.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime);
  // Keys act only once the player has a snapshot; the position slider is enabled from then on.
  await expect(page.getByRole("slider", { name: "Playback position" })).toBeEnabled();

  await page.keyboard.press("m");
  await expect(osd).toHaveText("Muted");
  await page.keyboard.press("ArrowRight");
  await expect(osd).toHaveText("+10 s");
  await page.keyboard.press("5");
  await expect(osd).toHaveText("50%");
  await expect.poll(currentTime).toBe(60);
  await page.keyboard.press("Home");
  await expect(osd).toHaveText("Start");
  await expect.poll(currentTime).toBe(0);
});

test("the chrome stays up while paused and while a sheet is open, and hides after the idle time", async ({ page }) => {
  await startArrival(page, true);
  const chrome = page.locator(".player-chrome");
  const player = page.locator(".player-page");
  const paused = () => page.locator("video").evaluate((element: HTMLVideoElement) => element.paused);
  await expect.poll(paused).toBe(false);
  await player.hover();

  await page.keyboard.press("i");
  await expect(page.getByRole("region", { name: "Player information" })).toBeVisible();
  await page.waitForTimeout(3_500);
  await expect(chrome).toHaveAttribute("data-visible", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Player information" })).toHaveCount(0);

  await page.keyboard.press("k");
  await expect.poll(paused).toBe(true);
  await page.mouse.move(5, 5);
  await page.mouse.move(8, 8);
  await page.waitForTimeout(3_500);
  await expect(chrome).toHaveAttribute("data-visible", "true");

  await page.keyboard.press("k");
  await expect.poll(paused).toBe(false);
  await page.mouse.move(5, 5);
  await page.mouse.move(8, 8);
  await expect(chrome).toHaveAttribute("data-visible", "true");
  await expect(chrome).toHaveAttribute("data-visible", "false", { timeout: 6_000 });
});

test("nothing in the player blurs the video, with the chrome and each sheet open", async ({ page }) => {
  await startArrival(page);
  const blurred = () => page.locator("main").evaluate((root) => (
    [root, ...root.querySelectorAll("*")]
      .filter((element) => {
        const filter = getComputedStyle(element).getPropertyValue("backdrop-filter");
        return filter !== "" && filter !== "none";
      })
      .map((element) => element.className)
  ));

  await page.mouse.move(5, 5);
  await page.mouse.move(8, 8);
  expect(await blurred()).toEqual([]);
  await page.keyboard.press("i");
  await expect(page.getByRole("region", { name: "Player information" })).toBeVisible();
  expect(await blurred()).toEqual([]);
  await page.keyboard.press("a");
  await expect(page.getByRole("region", { name: "Audio and subtitles" })).toBeVisible();
  expect(await blurred()).toEqual([]);
});
