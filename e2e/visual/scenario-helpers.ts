import type { Page } from "@playwright/test";
import { SERVER, artDataUrl, type MockOptions } from "../support/mock-server";

export interface Scenario {
  name: string;
  opts?: MockOptions;
  fullPage?: boolean;
  // Defaults to the desktop viewports. Phone shots run at 390x844 only.
  phone?: boolean;
  // Captured only in the TV form (1920x1080-tv), with keyboard-driven states.
  tvOnly?: boolean;
  // Skipped in the TV pass: the state needs a pointer or a desktop-only key (the TV has neither).
  desktopOnly?: boolean;
  // Set when the scenario deliberately provokes a 404 from the mock server.
  expect404?: boolean;
  // Measure the contrast of every text run in the capture (see contrast-measure.ts).
  contrast?: boolean;
  run: (page: Page) => Promise<void>;
}

export async function go(page: Page, hash: string, settle = 500): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForTimeout(settle);
}

export async function signIn(page: Page): Promise<void> {
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
}

export async function signedInAt(page: Page, hash: string, settle = 600): Promise<void> {
  await signIn(page);
  await go(page, hash, settle);
}

// Paints a synthetic frame behind the browser player's <video>.
export async function play(page: Page, itemHash: string, frame = "frame"): Promise<void> {
  await signedInAt(page, itemHash);
  await page.getByRole("link", { name: /^(Play|Resume from)/ }).first().click();
  await page.locator("video").waitFor({ state: "attached", timeout: 8_000 });
  await page.addStyleTag({ content: `.browser-player{background:#000 url(${artDataUrl(frame)}) center/cover no-repeat !important}` });
  await page.waitForTimeout(400);
  await page.mouse.move(700, 450);
  await page.mouse.move(720, 460);
  await page.waitForTimeout(300);
}
