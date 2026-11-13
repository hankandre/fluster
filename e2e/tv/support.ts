// Helpers for the TV-form keyboard journeys: every journey drives the page with arrows, Enter, Escape,
// Backspace, and ContextMenu only (src/features/tv-journeys-lint.test.ts scans for pointer and Tab calls).
import { expect, type Locator, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "../support/mock-server";

export const TV_VIEWPORT = { width: 1920, height: 1080 };
export const SAFE_X = 96;
export const SAFE_Y = 54;

// Opens a route in the TV form through the development flag.
export async function openTv(page: Page, hash: string): Promise<void> {
  await page.setViewportSize(TV_VIEWPORT);
  await page.goto(`/?form=tv${hash}`);
}

// Signs in through the sign-in screen with the keyboard (Quick Connect approves at once in the mock), then
// opens `hash`. Returns once Home has loaded.
export async function signInTv(page: Page, opts: MockOptions = {}, hash = "#/next/home"): Promise<void> {
  await installMockServer(page, opts);
  await openTv(page, "#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.keyboard.insertText(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
  if (hash !== "#/next/home") {
    await page.evaluate((target) => { window.location.hash = target; }, hash);
  }
}

export async function expectFocused(locator: Locator): Promise<void> {
  await expect(locator).toBeFocused();
}

// Presses a key and waits for the focus to land on the expected element.
export async function pressTo(page: Page, key: string, expected: Locator): Promise<void> {
  await page.keyboard.press(key);
  await expect(expected).toBeFocused();
}

// No visible text renders under `min` px (DESIGN.md 6, 8). Visually hidden and clipped text is skipped.
export async function expectNoSmallText(page: Page, min = 22): Promise<void> {
  const small = await page.evaluate((floor) => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest("script, style, noscript, .visually-hidden, [aria-hidden='true'] svg")) continue;
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (parseFloat(style.fontSize) < floor) found.push(`${parent.className || parent.tagName}: "${text.slice(0, 40)}" ${style.fontSize}`);
    }
    return found;
  }, min);
  expect(small, "text under the TV size floor").toEqual([]);
}

// Every visible focusable control and its text lies inside the title-safe area (x 96..1824, y 54..1026).
// Artwork and backdrops bleed to the edges and are not checked.
export async function expectTitleSafe(page: Page, scope = "body"): Promise<void> {
  // Let a sliding nav or sheet settle before measuring.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))));
  const outside = await page.evaluate(([selector, safeX, safeY, width, height]) => {
    const found: string[] = [];
    const root = document.querySelector(selector as string);
    if (!root) return found;
    const candidates = root.querySelectorAll<HTMLElement>("a[href], button, input, h1, h2, [role='option'], p.ui-toast-message, .player-osd-pill");
    // Page content scrolls vertically, and rows scroll sideways with items peeking in from the edge, so those
    // bounds apply only to fixed layers (toasts, dialogs, sheets, the player), which cannot scroll.
    const inFixedLayer = (element: HTMLElement) => {
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === "fixed" || node.classList.contains("player-page")) return true;
      }
      return false;
    };
    const inSideScroller = (element: HTMLElement) => {
      for (let node: HTMLElement | null = element.parentElement; node; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX;
        if ((overflow === "auto" || overflow === "scroll") && node.scrollWidth > node.clientWidth) return true;
      }
      return false;
    };
    for (const element of candidates) {
      if (element.closest(".visually-hidden, [inert], .skip-link, .app-nav[data-hidden='true'], .browser-mode-label")) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const label = `${element.tagName}.${element.className}`;
      if (rect.top < 0 || rect.bottom > (height as number)) continue;
      if (inFixedLayer(element) && (rect.top < (safeY as number) - 1 || rect.bottom > (height as number) - (safeY as number) + 1)) {
        found.push(`${label} y ${Math.round(rect.top)}..${Math.round(rect.bottom)}`);
        continue;
      }
      if (inSideScroller(element)) continue;
      if (rect.left < (safeX as number) - 1 || rect.right > (width as number) - (safeX as number) + 1) {
        found.push(`${label} x ${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }
    return found;
  }, [scope, SAFE_X, SAFE_Y, TV_VIEWPORT.width, TV_VIEWPORT.height] as const);
  expect(outside, "elements outside the title-safe area").toEqual([]);
}

// Opens Arrival's detail page on the player mock (e2e/support/player-server.ts) in the TV form, signed in with
// the keyboard, with the play button focused.
export async function openArrivalTv(page: Page): Promise<void> {
  await openTv(page, "#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.keyboard.insertText("http://127.0.0.1:8096");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => { window.location.hash = "#/next/item/movie-1"; });
  await expect(page.getByRole("link", { name: /^(Play|Resume)/ })).toBeFocused({ timeout: 10_000 });
}

// The browser player's clock, started and tracked without real media.
export async function stubMedia(page: Page): Promise<void> {
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
    window.addEventListener("error", (event) => {
      if (event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
    }, true);
  });
}

export const videoTime = (page: Page): Promise<number> => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime);
