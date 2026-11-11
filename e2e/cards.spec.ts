import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

// P13-07: media cards and rows (DESIGN.md 7.4, 7.5).

async function signIn(page: Page, opts: MockOptions = {}): Promise<void> {
  await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

async function goTo(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`);
  await expect(page.locator("[data-media-card]").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("card-skeleton")).toHaveCount(0);
}

// The resolved value, in px, of a CSS length expression such as "var(--poster-w)".
async function px(page: Page, expression: string): Promise<number> {
  return page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;width:${value}`;
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, expression);
}

// Focus after a key press so :focus-visible applies, as it does for keyboard users.
async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await page.keyboard.press("Shift");
  await target.focus();
  await expect(target).toBeFocused();
}

const WINDOWS = [
  { name: "compact", width: 390, height: 844, tv: false },
  { name: "medium", width: 1024, height: 768, tv: false },
  { name: "expanded", width: 1440, height: 900, tv: false },
  { name: "wide", width: 1920, height: 1080, tv: false },
  { name: "tv", width: 1920, height: 1080, tv: true },
];

const ROUTES = [
  "#/next/home",
  "#/next/browse/lib-movies",
  "#/next/browse/lib-shows",
  "#/next/collection/box-1",
  "#/next/series/s1",
  "#/next/search/o",
];

test.describe("no card overlaps another at any window class", () => {
  for (const window of WINDOWS) {
    test(`${window.name} (${window.width}x${window.height})`, async ({ page }) => {
      await page.setViewportSize({ width: window.width, height: window.height });
      await signIn(page);
      for (const route of ROUTES) {
        await goTo(page, route);
        if (window.tv) await page.evaluate(() => document.documentElement.setAttribute("data-form", "tv"));
        const posterW = await px(page, "var(--poster-w)");
        const thumbW = await px(page, "var(--thumb-w)");

        const lists = await page.evaluate(() => {
          const rect = (element: Element) => {
            const box = element.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width };
          };
          const groups = new Map<Element, Element[]>();
          for (const card of document.querySelectorAll("[data-media-card]")) {
            const list = card.closest("ul") ?? document.body;
            groups.set(list, [...(groups.get(list) ?? []), card]);
          }
          return [...groups.values()].map((cards) => cards.map((card) => ({
            variant: card.getAttribute("data-variant"),
            card: rect(card),
            frame: rect(card.querySelector(".media-card-frame")!),
            text: card.querySelector(".media-card-text") ? rect(card.querySelector(".media-card-text")!) : undefined,
          })));
        });
        expect(lists.length, route).toBeGreaterThan(0);

        for (const cards of lists) {
          for (const [index, a] of cards.entries()) {
            const expected = a.variant === "poster" ? posterW : thumbW;
            expect(Math.abs(a.frame.width - expected), `${route} ${a.variant} frame width`).toBeLessThanOrEqual(1);
            if (a.text) {
              expect(a.text.left, route).toBeGreaterThanOrEqual(a.card.left - 0.5);
              expect(a.text.right, route).toBeLessThanOrEqual(a.card.right + 0.5);
              expect(a.text.bottom, route).toBeLessThanOrEqual(a.card.bottom + 0.5);
            }
            for (const b of cards.slice(index + 1)) {
              const intersects = a.card.left < b.card.right - 0.5 && b.card.left < a.card.right - 0.5
                && a.card.top < b.card.bottom - 0.5 && b.card.top < a.card.bottom - 0.5;
              expect(intersects, `${route}: two cards intersect`).toBe(false);
            }
          }
        }
      }
    });
  }
});

test.describe("episode text never sits under its art", () => {
  for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await signIn(page);
      await goTo(page, "#/next/series/s1");
      const pairs = await page.evaluate(() => [...document.querySelectorAll(".episode-list > li")].map((item) => {
        const frame = item.querySelector(".media-card-frame")!.getBoundingClientRect();
        const text = item.querySelector(".episode-text")!.getBoundingClientRect();
        return { frame: [frame.left, frame.top, frame.right, frame.bottom], text: [text.left, text.top, text.right, text.bottom] };
      }));
      expect(pairs.length).toBeGreaterThan(0);
      for (const { frame, text } of pairs) {
        const intersects = frame[0] < text[2] && text[0] < frame[2] && frame[1] < text[3] && text[1] < frame[3];
        expect(intersects).toBe(false);
      }
    });
  }
});

test("a card's accessible name includes the time left", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("link", { name: /^Saltwater Hours/ }).first()).toHaveAccessibleName(/1 hour 4 minutes left/);
});

test("the focused card stays one gutter inside the window edges", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, { longRows: true });
  const cards = page.getByRole("region", { name: "Latest in Movies" }).locator("a.media-card");
  await expect(cards).toHaveCount(18);
  const gutter = await px(page, "var(--gutter)");

  // The link's own box excludes the lift scale on its frame.
  async function expectInside(card: Locator): Promise<void> {
    await expect.poll(async () => {
      const box = await card.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: document.documentElement.clientWidth };
      });
      return box.left >= gutter - 1 && box.right <= box.width - gutter + 1;
    }).toBe(true);
  }

  await focusByKeyboard(page, cards.first());
  await expectInside(cards.first());
  for (let index = 1; index < 18; index += 1) {
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(index)).toBeFocused();
    await expectInside(cards.nth(index));
  }
  await page.keyboard.press("Home");
  await expect(cards.first()).toBeFocused();
  await expectInside(cards.first());
});

test("the lifted focus ring is not clipped by the row at the TV form", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page);
  await page.evaluate(() => document.documentElement.setAttribute("data-form", "tv"));
  const regions = ["Continue watching", "Latest in Movies"];
  for (const name of regions) {
    const region = page.getByRole("region", { name });
    const card = region.locator("a.media-card").first();
    await focusByKeyboard(page, card);
    const frame = card.locator(".media-card-frame");
    await expect.poll(() => frame.evaluate((element) => getComputedStyle(element).transform)).toBe("matrix(1.08, 0, 0, 1.08, 0, 0)");
    const { inside } = await frame.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const list = element.closest(".media-row-list")!.getBoundingClientRect();
      const ring = 4;
      return {
        inside: box.left - ring >= list.left && box.right + ring <= list.right
          && box.top - ring >= list.top && box.bottom + ring <= list.bottom,
      };
    });
    expect(inside, name).toBe(true);
  }
});

test("Up and Down move between rows to the nearest card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  const row = (name: string) => page.getByRole("region", { name }).locator("a.media-card");
  const centre = (card: Locator) => card.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left + box.width / 2;
  });
  async function nearest(name: string, x: number): Promise<number> {
    return page.getByRole("region", { name }).evaluate((region, target) => {
      const centres = [...region.querySelectorAll("a.media-card")].map((card) => {
        const box = card.getBoundingClientRect();
        return Math.abs(box.left + box.width / 2 - target);
      });
      return centres.indexOf(Math.min(...centres));
    }, x);
  }

  const second = row("Continue watching").nth(1);
  await focusByKeyboard(page, second);
  await page.keyboard.press("ArrowDown");
  const nextUp = await nearest("Next up", await centre(second));
  await expect(row("Next up").nth(nextUp)).toBeFocused();

  const fromNextUp = await centre(row("Next up").nth(nextUp));
  await page.keyboard.press("ArrowDown");
  const latest = await nearest("Latest in Movies", fromNextUp);
  await expect(row("Latest in Movies").nth(latest)).toBeFocused();

  const fromLatest = await centre(row("Latest in Movies").nth(latest));
  await page.keyboard.press("ArrowUp");
  const back = await nearest("Next up", fromLatest);
  await expect(row("Next up").nth(back)).toBeFocused();

  // Up from the first row reaches a hero action, with arrow keys alone.
  await focusByKeyboard(page, second);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("region", { name: "Saltwater Hours" }).locator("a:focus")).toHaveCount(1);
});

test("reduced motion removes the focus lift", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  const card = page.locator("a.media-card").first();
  await focusByKeyboard(page, card);
  await expect(card.locator(".media-card-frame")).toHaveCSS("transform", "none");
});
