import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

// P17-03: the Languages section saves the account's audio and subtitle languages, with the keyboard alone.

async function signIn(page: Page, opts?: MockOptions): Promise<void> {
  // The routes outlive a reload, and so does the mock's stored configuration.
  if (opts) await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

async function openLanguages(page: Page): Promise<void> {
  await page.evaluate(() => { window.location.hash = "#/next/settings"; });
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.getByRole("tab", { name: "Playback" }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Languages" })).toBeFocused();
  await expect(page.getByRole("heading", { level: 2, name: "Languages" })).toBeVisible();
}

const audio = (page: Page) => page.getByRole("button", { name: /^Audio language/ });
const subtitles = (page: Page) => page.getByRole("button", { name: /^Subtitle language/ });

test("both languages with the keyboard alone, saved to the account and found after a reload", async ({ page }) => {
  const posts: Record<string, unknown>[] = [];
  const opts: MockOptions = { configurationLog: posts, manySubtitles: "default" };
  await signIn(page, opts);
  await openLanguages(page);
  await expect(audio(page)).toBeEnabled();
  await expect(audio(page)).toHaveText("The file's default");

  await page.keyboard.press("ArrowRight");
  await expect(audio(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.type("fre");
  await expect(page.getByRole("option", { name: "French", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(audio(page)).toHaveText("French");
  await expect(page.getByText(/Play default audio track is off/)).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(subtitles(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.type("fre");
  await expect(page.getByRole("option", { name: "French, when the audio is in another language" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "French, always" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(subtitles(page)).toHaveText("French, always");

  await expect.poll(() => posts.length).toBe(2);
  expect(posts[0]).toMatchObject({ AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false, SubtitleMode: "Default" });
  expect(posts[1]).toMatchObject({ AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false, SubtitleLanguagePreference: "fra", SubtitleMode: "Always" });
  // Only the row's two fields change; every other field is posted back as read.
  const { AudioLanguagePreference: _a, PlayDefaultAudioTrack: _p, ...restFirst } = posts[0];
  const { AudioLanguagePreference: _a2, PlayDefaultAudioTrack: _p2, SubtitleLanguagePreference: _s, SubtitleMode: _m, ...restSecond } = posts[1];
  const { SubtitleLanguagePreference: _s0, SubtitleMode: _m0, ...restFirstOnly } = restFirst;
  expect(restSecond).toEqual(restFirstOnly);

  // Nothing about the languages is kept in the browser: only the preferences and the install id are stored.
  const storage = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(window.localStorage)),
    session: Object.fromEntries(Object.entries(window.sessionStorage)),
  }));
  expect(Object.keys(storage.local).filter((name) => name !== "fluster.preferences" && name !== "fluster.installId")).toEqual([]);
  for (const value of [...Object.values(storage.local), ...Object.values(storage.session)]) {
    expect(value).not.toContain("test-token");
    expect(value).not.toContain("Language");
    expect(value).not.toContain("fra");
  }

  // The detail list follows at once, and Play asks the server for nothing about languages.
  const playbackInfo: { body: string; query: string }[] = [];
  page.on("request", (request) => {
    if (/\/PlaybackInfo$/.test(new URL(request.url()).pathname)) playbackInfo.push({ body: request.postData() ?? "", query: new URL(request.url()).search });
  });
  await page.evaluate(() => { window.location.hash = "#/next/item/m1"; });
  const info = page.getByRole("region", { name: "Media info for 4K HDR" });
  await expect(info.getByRole("button", { name: "Show all 52 subtitles" })).toBeVisible();
  const items = info.getByText("Subtitles", { exact: true }).locator("xpath=following-sibling::dd[1]").locator("li");
  await expect(items.first()).toBeVisible();
  for (const text of await items.allTextContents()) expect(text).toMatch(/^French/);
  await page.getByRole("link", { name: /^(Play|Resume)/ }).first().click();
  await expect.poll(() => playbackInfo.length).toBeGreaterThan(0);
  for (const sent of playbackInfo) {
    for (const text of [sent.body, sent.query]) {
      expect(text).not.toContain("AudioStreamIndex");
      expect(text).not.toContain("SubtitleStreamIndex");
      expect(text).not.toMatch(/Language/);
    }
  }

  // After a reload and a new sign-in (the session is memory only) the server still holds both.
  await page.reload();
  await signIn(page);
  await openLanguages(page);
  await expect(audio(page)).toHaveText("French");
  await expect(subtitles(page)).toHaveText("French, always");
});

test("a refused save shows both rows as unavailable", async ({ page }) => {
  await signIn(page, { configurationSave: "refuse" });
  await openLanguages(page);
  await expect(audio(page)).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Your server didn't accept this change from Fluster. Change it in Jellyfin.")).toHaveCount(2);
  await expect(audio(page)).toHaveCount(0);
});

test("a failed save puts the old value back and says so", async ({ page }) => {
  await signIn(page, { configurationSave: "fail" });
  await openLanguages(page);
  await expect(audio(page)).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("fre");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Couldn't save your audio language. Try again.")).toBeVisible();
  await expect(audio(page)).toHaveText("The file's default");
});
