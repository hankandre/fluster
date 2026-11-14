// Six art-heavy surfaces over the bright, busy worst-case art (P13-30). Each is captured at both desktop sizes
// and its text runs are measured for contrast (contrast-measure.ts). Names start at 100 to stay clear of the TV 90-97.
import { play, signIn, signedInAt, type Scenario } from "./scenario-helpers";

const base = { desktopOnly: true, contrast: true } as const;

export const worstArtScenarios: Scenario[] = [
  { ...base, name: "100-worst-art-home-hero", opts: { worstCaseArt: true }, run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(1_200);
  } },
  { ...base, name: "101-worst-art-home-card", opts: { worstCaseArt: true }, run: async (page) => {
    await signIn(page);
    await page.waitForTimeout(800);
    const card = page.getByRole("region", { name: "Continue watching" }).locator("a.media-card").first();
    await card.focus();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
  } },
  { ...base, name: "102-worst-art-detail", opts: { worstCaseArt: true }, run: (page) => signedInAt(page, "#/next/item/ep-2", 1_000) },
  { ...base, name: "103-worst-art-series", opts: { worstCaseArt: true }, run: (page) => signedInAt(page, "#/next/series/s1", 1_000) },
  // The chrome is shown by the last mouse move in play(); the measurement follows within 1 s, inside the 3 s idle window.
  { ...base, name: "104-worst-art-player", opts: { worstCaseArt: true }, run: (page) => play(page, "#/next/item/ep-2", "worst-still") },
  // Like 55a: the mouse moves after Up Next appears, so the chrome is shown and the measurement runs inside the 3 s idle window.
  { ...base, name: "105-worst-art-up-next", opts: { worstCaseArt: true, duration: 25, short: true }, run: async (page) => {
    await play(page, "#/next/item/ep-1", "worst-still");
    await page.getByRole("complementary", { name: "Up next" }).waitFor({ timeout: 8_000 });
    await page.mouse.move(700, 400);
    await page.mouse.move(720, 410);
    await page.waitForTimeout(500);
  } },
];
