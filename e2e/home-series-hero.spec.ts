import { expect, test, type Page, type Request } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

// P3-27: the Home hero of a series and its series page start the same episode, from the same position.

// Empties Continue watching, Next up, and Latest in Movies, so the hero is Harbor Lights from Latest in Shows.
const HIDDEN_MOVIES = new Set(["m1", "m2", "m3", "m4", "m5", "m6"]);

async function signIn(page: Page, opts: MockOptions): Promise<void> {
  await installMockServer(page, { homeLatestOnly: true, hiddenFromLatest: HIDDEN_MOVIES, ...opts });
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

const cases = [
  { mode: "resume", label: "Resume S1 · E2", itemId: "ep-2", href: "#/next/play/ep-2?start=13200000000", startTicks: 13_200_000_000 },
  { mode: "next", label: "Play S1 · E3", itemId: "ep-3", href: "#/next/play/ep-3", startTicks: 0 },
  { mode: "none", label: "Play S1 · E1", itemId: "ep-1", href: "#/next/play/ep-1", startTicks: 0 },
] as const;

function playbackInfo(page: Page): Promise<Request> {
  return page.waitForRequest((request) => /^\/Items\/[^/]+\/PlaybackInfo$/.test(new URL(request.url()).pathname));
}

function started(request: Request): { itemId: string; startTicks: unknown } {
  const url = new URL(request.url());
  const body = request.postDataJSON() as Record<string, unknown>;
  // The flag is sent in the body and the query string alike (ARCHITECTURE.md 3).
  expect(url.searchParams.get("StartTimeTicks")).toBe(String(body.StartTimeTicks));
  return { itemId: /^\/Items\/([^/]+)\//.exec(url.pathname)![1], startTicks: body.StartTimeTicks };
}

for (const { mode, label, itemId, href, startTicks } of cases) {
  test(`the series hero and the series page start the same episode (${mode})`, async ({ page }) => {
    await signIn(page, { seriesNextUp: mode });

    const hero = page.getByRole("region", { name: "Harbor Lights" });
    const heroPrimary = hero.getByRole("link", { name: label });
    await expect(heroPrimary).toHaveAttribute("href", href);
    const fromHero = playbackInfo(page);
    await heroPrimary.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[?]/g, "\\?")}$`));
    const heroStart = started(await fromHero);
    expect(heroStart).toEqual({ itemId, startTicks });

    await page.goto("/#/next/series/s1");
    const seriesPrimary = page.getByRole("link", { name: label });
    await expect(seriesPrimary).toHaveAttribute("href", href);
    const fromSeries = playbackInfo(page);
    await seriesPrimary.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[?]/g, "\\?")}$`));
    expect(started(await fromSeries)).toEqual(heroStart);
  });
}
