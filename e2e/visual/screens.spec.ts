import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installMockServer } from "../support/mock-server";
import { scenarios } from "./scenarios";

const outDir = join(process.cwd(), "visual-captures");
const FIXED_TIME = new Date("2026-11-08T12:00:00Z");

const baselineDir = join(process.cwd(), "e2e", "visual", "baselines");
const compare = Boolean(process.env.CI) || process.env.FLUSTER_VISUAL_COMPARE === "1";

const desktop = [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }];
const phone = [{ width: 390, height: 844 }];
// The 10-foot form (DESIGN.md 6): every non-phone scenario again at 1920x1080 with <html data-form="tv">.
const tv = [{ width: 1920, height: 1080, form: "tv" }];

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

// Every `<W>x<H>/<name>.png` the scenarios produce. A missing baselines directory is an empty set.
function listBaselines(): string[] {
  let sizes: string[];
  try {
    sizes = readdirSync(baselineDir);
  } catch {
    return [];
  }
  return sizes.flatMap((size) => {
    try {
      return readdirSync(join(baselineDir, size)).map((file) => `${size}/${file}`);
    } catch {
      return [];
    }
  }).sort();
}

if (compare) {
  test("baselines match scenarios", () => {
    const expected = scenarios
      .flatMap((scenario) => (scenario.phone ? phone : desktop).map((viewport) => `${viewport.width}x${viewport.height}/${scenario.name}.png`))
      .sort();
    expect(listBaselines()).toEqual(expected);
  });
}

for (const scenario of scenarios) {
  const passes = scenario.phone ? phone : scenario.tvOnly ? tv : scenario.desktopOnly ? desktop : [...desktop, ...tv];
  for (const pass of passes) {
    const { width, height } = pass;
    const form = "form" in pass ? pass.form : undefined;
    const size = `${width}x${height}${form ? `-${form}` : ""}`;
    const viewport = { width, height };
    test.describe(size, () => {
      test.use({ viewport });
      test(scenario.name, async ({ page }) => {
        // The root element does not exist yet when an init script runs, so apply the form once it appears.
        if (form) {
          await page.addInitScript((value) => {
            const apply = () => { if (document.documentElement) document.documentElement.dataset.form = value; };
            apply();
            new MutationObserver(apply).observe(document, { childList: true });
          }, form);
        }
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
        const image = await page.screenshot({
          fullPage: Boolean(scenario.fullPage),
          animations: "disabled",
          caret: "hide",
          scale: "css",
        });
        writeFileSync(join(outDir, size, `${scenario.name}.png`), image);
        if (compare) expect(image).toMatchSnapshot([size, `${scenario.name}.png`]);
      });
    });
  }
}
