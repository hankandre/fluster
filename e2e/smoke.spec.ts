import { expect, test } from "@playwright/test";

test("shows the manual Jellyfin connection screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Connect your Jellyfin library/i })).toBeVisible();
  await expect(page.getByLabel("SERVER URL")).toHaveAttribute("type", "url");
  await expect(page.getByText("Browser development mode")).toBeVisible();
});

test("connects, signs in, and opens the in-shell browser player", async ({ page }) => {
  const playbackRequests: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get: () => 120,
    });
    HTMLMediaElement.prototype.play = function play() {
      queueMicrotask(() => {
        this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("playing"));
      });
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event("pause"));
    };
    HTMLMediaElement.prototype.load = () => undefined;
  });

  await page.route("http://jellyfin.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (path === "/System/Info/Public") return json({ ServerName: "Testfin", Version: "10.11.7" });
    if (path === "/Users/AuthenticateByName") {
      return json({ AccessToken: "test-token", User: { Id: "user-1", Name: "Tester" } });
    }
    if (path === "/Users/user-1/Items") {
      return json({ Items: [{
        Id: "movie-1",
        Name: "Embedded Movie",
        Type: "Movie",
        RunTimeTicks: 1_200_000_000,
        UserData: { PlaybackPositionTicks: 420_000_000, Played: false },
      }] });
    }
    if (path === "/Items/movie-1/PlaybackInfo") {
      playbackRequests.push(route.request().postDataJSON());
      return json({
        PlaySessionId: `play-${playbackRequests.length}`,
        MediaSources: [{
          Id: "source-1",
          Path: "/media/movie.mp4",
          Protocol: "File",
          SupportsDirectPlay: true,
          MediaStreams: [{ Index: 0, Type: "Video", DisplayTitle: "H.264" }],
        }],
      });
    }
    if (path.startsWith("/Sessions/Playing")) return route.fulfill({ status: 204 });
    if (path === "/Videos/movie-1/stream") {
      return route.fulfill({ status: 200, contentType: "video/mp4", body: "" });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto("/");
  await page.getByLabel("SERVER URL").fill("http://jellyfin.test");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByLabel("USERNAME").fill("Tester");
  await page.getByLabel("PASSWORD").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Play Embedded Movie" }).click();
  await expect(page.getByRole("heading", { name: "Resume Embedded Movie?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Over" })).toBeVisible();
  await page.getByRole("button", { name: "Resume at 0:42" }).click();

  await expect(page.getByRole("heading", { name: "Embedded Movie" })).toBeVisible();
  await expect(page.getByText("Browser — unverified")).toBeVisible();
  expect(playbackRequests[0]).toMatchObject({
    StartTimeTicks: 420_000_000,
    EnableDirectPlay: true,
    EnableDirectStream: false,
    EnableTranscoding: false,
  });

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => playbackRequests.length).toBe(2);
  await expect(page.getByLabel("Back to library")).toBeVisible();
});
