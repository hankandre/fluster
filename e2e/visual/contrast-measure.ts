// Measures the contrast of every visible text run in a capture (DESIGN.md 11 rule 1).
// The text is hidden for a second, background-only shot; the ratio of each run is read from those pixels.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { decodePng, measureRun, requiredRatio } from "../../scripts/contrast.mjs";

interface TextRun {
  key: string;
  text: string;
  color: [number, number, number];
  alpha: number;
  fontSizePx: number;
  fontWeight: number;
  rect: { x: number; y: number; width: number; height: number };
}

const resultsDir = join(process.cwd(), "test-results", "contrast");

// Every visible line of text: one run per client rect of each non-empty text node.
export async function collectTextRuns(page: Page, fullPage: boolean): Promise<TextRun[]> {
  return page.evaluate((full) => {
    const bounds = full
      ? { left: 0, top: 0, right: document.documentElement.scrollWidth, bottom: document.documentElement.scrollHeight }
      : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const offsetX = full ? window.scrollX : 0;
    const offsetY = full ? window.scrollY : 0;
    const parse = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).map(Number);
    const runs: TextRun[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let index = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      if (!text) continue;
      const position = index;
      index += 1;
      const parent = node.parentElement;
      if (!parent) continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== "visible" || style.display === "none") continue;
      const [r, g, b, a = 1] = parse(style.color);
      let alpha = a;
      const clips: DOMRect[] = [];
      for (let el: Element | null = parent; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        alpha *= Number(s.opacity);
        if (s.overflowX !== "visible" || s.overflowY !== "visible" || s.clip !== "auto") clips.push(el.getBoundingClientRect());
      }
      if (alpha < 0.05) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()];
      lines.forEach((line, lineIndex) => {
        let left = Math.max(line.left + offsetX, bounds.left);
        let top = Math.max(line.top + offsetY, bounds.top);
        let right = Math.min(line.right + offsetX, bounds.right);
        let bottom = Math.min(line.bottom + offsetY, bounds.bottom);
        for (const clip of clips) {
          left = Math.max(left, clip.left + offsetX);
          top = Math.max(top, clip.top + offsetY);
          right = Math.min(right, clip.right + offsetX);
          bottom = Math.min(bottom, clip.bottom + offsetY);
        }
        if (right - left < 2 || bottom - top < 2) return;
        runs.push({
          key: `${position}:${lineIndex}`,
          text: text.slice(0, 40),
          color: [r, g, b],
          alpha,
          fontSizePx: parseFloat(style.fontSize),
          fontWeight: Number(style.fontWeight),
          rect: { x: left, y: top, width: right - left, height: bottom - top },
        });
      });
    }
    return runs;
  }, fullPage);
}

const HIDE_TEXT = "*, *::before, *::after, ::placeholder { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }";

// Call right after the capture is written: no waits between the steps, so the player chrome stays as it was.
export async function measureCapture(page: Page, name: string, size: string, fullPage: boolean): Promise<void> {
  const runs = await collectTextRuns(page, fullPage);
  const style = await page.addStyleTag({ content: HIDE_TEXT });
  const background = await page.screenshot({ fullPage, animations: "disabled", caret: "hide", scale: "css" });
  await style.evaluate((element) => element.remove());
  const again = await collectTextRuns(page, fullPage);
  const keys = (list: TextRun[]) => list.map((run) => run.key).join(",");
  if (keys(runs) !== keys(again)) throw new Error(`${size}/${name}: the text changed between the two screenshots (${runs.length} runs, then ${again.length})`);
  if (runs.length === 0) throw new Error(`${size}/${name}: no visible text runs were collected`);
  const pixels = decodePng(background);
  const viewport = page.viewportSize();
  if (!fullPage && viewport && (pixels.width !== viewport.width || pixels.height !== viewport.height)) {
    throw new Error(`${size}/${name}: the background shot is ${pixels.width}x${pixels.height}, not the ${viewport.width}x${viewport.height} viewport`);
  }
  const results = runs.map((run) => {
    const { ratio, lowest } = measureRun(pixels.rgba, pixels.width, run.rect, run.color, run.alpha);
    return {
      text: run.text,
      fontSizePx: run.fontSizePx,
      fontWeight: run.fontWeight,
      required: requiredRatio(run.fontSizePx, run.fontWeight),
      ratio,
      lowest,
      x: Math.round(run.rect.x),
      y: Math.round(run.rect.y),
      width: Math.round(run.rect.width),
      height: Math.round(run.rect.height),
    };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  mkdirSync(join(resultsDir, size), { recursive: true });
  writeFileSync(join(resultsDir, size, `${name}.json`), `${JSON.stringify({ capture: `${size}/${name}`, runs: results }, null, 2)}\n`);
}
