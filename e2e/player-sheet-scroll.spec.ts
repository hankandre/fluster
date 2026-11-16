import { expect, test, type Page } from "@playwright/test";
import { mockPlayerServer, openArrival } from "./support/player-server";
import { openArrivalTv, stubMedia } from "./tv/support";

// A sheet slides in from beyond the right edge of the player page. WebKitGTK (the desktop app's engine) still
// reveals the focused element after a plain focus() earlier in the same task, even when the sheet's own focus
// passed preventScroll, so it scrolled the page sideways by the sheet's width until the animation ended.
// Chromium does not, so this reveals the focused element the way WebKit does on the sheet's first frame, and
// checks that neither the player page nor any ancestor moves while the sheet animates in.
type Sample = { t: number; page: number; ancestors: number; sheetLeft: number | null };

async function sampleWhileOpening(page: Page, open: () => Promise<void>): Promise<{ samples: Sample[]; revealedAt: number | null }> {
  await page.evaluate(() => {
    const state = { samples: [] as Sample[], revealedAt: null as number | null };
    (window as unknown as { sheetScroll: typeof state }).sheetScroll = state;
    const root = document.querySelector<HTMLElement>(".player-page");
    if (!root) throw new Error("no player page");
    const start = performance.now();
    const ancestors = () => {
      let most = Math.abs(window.scrollX);
      for (let node = root.parentElement; node; node = node.parentElement) most = Math.max(most, Math.abs(node.scrollLeft));
      return most;
    };
    const tick = () => {
      const sheet = document.querySelector<HTMLElement>(".player-sheet");
      if (sheet && state.revealedAt === null) {
        state.revealedAt = sheet.getBoundingClientRect().left;
        (document.activeElement as HTMLElement | null)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      state.samples.push({
        t: performance.now() - start,
        page: root.scrollLeft,
        ancestors: ancestors(),
        sheetLeft: sheet ? sheet.getBoundingClientRect().left : null,
      });
      if (performance.now() - start < 1_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await open();
  await page.waitForFunction(() => {
    const state = (window as unknown as { sheetScroll: { samples: Sample[] } }).sheetScroll;
    return (state.samples.at(-1)?.t ?? 0) >= 1_000;
  });
  return page.evaluate(() => (window as unknown as { sheetScroll: { samples: Sample[]; revealedAt: number | null } }).sheetScroll);
}

async function expectPageStill(page: Page, open: () => Promise<void>) {
  const { samples, revealedAt } = await sampleWhileOpening(page, open);
  const width = page.viewportSize()?.width ?? 0;
  const sheetWidth = await page.locator(".player-sheet").evaluate((sheet) => sheet.getBoundingClientRect().width);
  // The reveal ran while the sheet was still sliding in, so it had somewhere to scroll to.
  expect(revealedAt).not.toBeNull();
  expect(revealedAt as number).toBeGreaterThan(width - sheetWidth);
  expect(samples.filter((sample) => sample.page !== 0 || sample.ancestors !== 0)).toEqual([]);
  await expect.poll(() => page.locator(".player-page").evaluate((root) => root.scrollLeft)).toBe(0);
  const settled = await page.locator(".player-sheet").evaluate((sheet) => sheet.getBoundingClientRect().right);
  expect(Math.round(settled)).toBeLessThanOrEqual(width);
}

async function startDesktop(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockPlayerServer(page);
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Info" })).toBeVisible();
}

for (const sheet of [
  { button: "Info", key: "i", region: "Player information" },
  { button: "Audio & Subtitles", key: "a", region: "Audio and subtitles" },
]) {
  test(`desktop: opening ${sheet.button} from its button never scrolls the player page`, async ({ page }) => {
    await startDesktop(page);
    await expectPageStill(page, () => page.getByRole("button", { name: sheet.button }).click());
    await expect(page.getByRole("region", { name: sheet.region })).toBeVisible();
  });

  test(`desktop: switching to ${sheet.button} from the other sheet never scrolls the player page`, async ({ page }) => {
    await startDesktop(page);
    await page.keyboard.press(sheet.key === "i" ? "a" : "i");
    await expect(page.locator(".player-sheet")).toBeVisible();
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
    await expectPageStill(page, () => page.keyboard.press(sheet.key));
    await expect(page.getByRole("region", { name: sheet.region })).toBeVisible();
  });

  test(`TV: opening ${sheet.button} from the control row never scrolls the player page`, async ({ page }) => {
    await mockPlayerServer(page);
    await stubMedia(page);
    await openArrivalTv(page);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("slider", { name: "Playback position" })).toBeEnabled();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    const trigger = page.getByRole("button", { name: sheet.button });
    for (let step = 0; step < 6 && !(await trigger.evaluate((element) => element === document.activeElement)); step += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(trigger).toBeFocused();
    await expectPageStill(page, () => page.keyboard.press("Enter"));
    await expect(page.getByRole("region", { name: sheet.region })).toBeVisible();
  });
}
