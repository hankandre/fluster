import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, parseHex, parseRgbAlpha, type Rgb } from "./contrast";

const tokensCss = readFileSync(join(__dirname, "tokens.css"), "utf8");
const rootBlock = /:root \{([\s\S]*?)\n\}/.exec(tokensCss)?.[1] ?? "";

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(rootBlock);
  if (!match) throw new Error(`Missing token ${name}`);
  return match[1].trim();
}

function solid(name: string): Rgb {
  return parseHex(token(name));
}

// Each row is a DESIGN.md §3.1 pair: the documented ratio and the WCAG minimum it must meet.
const pairs: { fg: string; bg: string; documented: number; minimum: number; use: string }[] = [
  { fg: "--text-1", bg: "--surface-0", documented: 17.0, minimum: 4.5, use: "titles and body" },
  { fg: "--text-2", bg: "--surface-0", documented: 8.0, minimum: 4.5, use: "overview and secondary labels" },
  { fg: "--text-3", bg: "--surface-1", documented: 5.1, minimum: 4.5, use: "meta and placeholders" },
  { fg: "--on-light", bg: "--text-1", documented: 17.0, minimum: 4.5, use: "text on primary buttons" },
  { fg: "--focus", bg: "--surface-0", documented: 17.9, minimum: 3, use: "focus ring" },
  { fg: "--danger", bg: "--surface-0", documented: 8.5, minimum: 4.5, use: "errors" },
  { fg: "--notice", bg: "--surface-0", documented: 10.8, minimum: 4.5, use: "converting and warnings" },
  { fg: "--ok", bg: "--surface-0", documented: 11.1, minimum: 4.5, use: "success" },
  { fg: "--art-accent", bg: "--surface-0", documented: 11.8, minimum: 3, use: "default artwork accent" },
];

describe("DESIGN.md §3.1 token contrast", () => {
  for (const pair of pairs) {
    it(`${pair.fg} on ${pair.bg} (${pair.use}) meets ${pair.minimum}:1 and the documented ${pair.documented}:1`, () => {
      const ratio = contrastRatio(solid(pair.fg), solid(pair.bg));
      expect(ratio).toBeGreaterThanOrEqual(pair.minimum);
      expect(ratio).toBeGreaterThanOrEqual(pair.documented - 0.1);
    });
  }

  // DESIGN.md §3.1 (corrected in P13-02): --line-strong borders controls, so it needs 3:1 on every surface.
  for (const surface of ["--surface-0", "--surface-1", "--surface-2", "--surface-3"]) {
    it(`--line-strong on ${surface} meets the 3:1 non-text minimum`, () => {
      const { rgb, alpha } = parseRgbAlpha(token("--line-strong"));
      const bg = solid(surface);
      expect(contrastRatio(composite(rgb, alpha, bg), bg)).toBeGreaterThanOrEqual(3);
    });
  }

  it("holds the documented surface ramp", () => {
    expect(token("--surface-0")).toBe("#0b0c0e");
    expect(token("--text-1")).toBe("#f2efe9");
    expect(token("--focus")).toBe("#fff4dc");
  });
});
