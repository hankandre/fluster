import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// With reduced motion the countdown is text only (DESIGN.md 5, 7.15).
const css = readFileSync(join(__dirname, "player.css"), "utf8");

// The text of the first top-level rule block for a selector, outside any media query.
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.[\]]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  return match?.[1] ?? "";
}

// The block that mentions the fill; an earlier one belongs to the scrubber.
const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n  \}/g)].map((match) => match[1]);
const reduced = blocks.find((block) => block.includes(".up-next-fill")) ?? "";
const outsideReduced = css.replace(reduced, "");

describe("Up Next reduced motion", () => {
  it("has a reduced-motion block", () => {
    expect(reduced).not.toBe("");
  });

  it("hides the fill and shows the countdown text only with reduced motion", () => {
    expect(ruleBody(reduced, ".up-next-fill")).toMatch(/display:\s*none/);
    const shown = ruleBody(reduced, ".up-next-countdown");
    expect(shown).toMatch(/position:\s*static/);
    expect(shown).toMatch(/overflow:\s*visible/);
  });

  it("draws the fill and hides the text by default", () => {
    expect(ruleBody(outsideReduced, ".up-next-fill")).not.toMatch(/display:\s*none/);
    expect(ruleBody(outsideReduced, ".up-next-fill")).toMatch(/animation:\s*up-next-fill/);
    const hidden = ruleBody(outsideReduced, ".up-next-countdown");
    expect(hidden).toMatch(/clip:\s*rect\(0 0 0 0\)/);
    expect(hidden).toMatch(/position:\s*absolute/);
  });
});
