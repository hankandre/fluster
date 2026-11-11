import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installMockServer } from "../support/mock-server";
import { scenarios } from "./scenarios";

const outDir = join(process.cwd(), "visual-captures");
const FIXED_TIME = new Date("2026-11-08T12:00:00Z");

const desktop = [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }];
const phone = [{ width: 390, height: 844 }];

// Freezes motion and waits for fonts and images so a capture is repeatable.
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // A lazy image far below the fold never loads, so each decode waits at most 1.5 s.
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await Promise.all([...document.images].map((image) => (image.complete ? undefined : Promise.race([image.decode().catch(() => undefined), wait(1_500)]))));
  });
  await page.waitForTimeout(150);
}

for (const scenario of scenarios) {
  for (const viewport of scenario.phone ? phone : desktop) {
    const size = `${viewport.width}x${viewport.height}`;
    test.describe(size, () => {
      test.use({ viewport });
      test(scenario.name, async ({ page }) => {
        await page.clock.setFixedTime(FIXED_TIME);
        await page.addInitScript(() => {
          document.addEventListener("DOMContentLoaded", () => {
            const style = document.createElement("style");
            style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
            document.head.append(style);
          });
        });
        const notFound = await installMockServer(page, scenario.opts);
        await scenario.run(page);
        if (!scenario.expect404) expect(notFound, "mock server 404s (mock drift)").toEqual([]);
        await settle(page);
        mkdirSync(join(outDir, size), { recursive: true });
        await page.screenshot({
          path: join(outDir, size, `${scenario.name}.png`),
          fullPage: Boolean(scenario.fullPage),
          animations: "disabled",
          caret: "hide",
        });
      });
    });
  }
}
