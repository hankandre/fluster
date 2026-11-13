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

  // Every surface a text or state colour is used on. --text-3 is for meta, placeholders, and disabled text on
  // surface-0 to surface-2 only (4.17:1 on surface-3 fails 4.5:1; DESIGN.md §3.1).
  const textSurfaces: Record<string, string[]> = {
    "--text-1": ["--surface-0", "--surface-1", "--surface-2", "--surface-3"],
    "--text-2": ["--surface-0", "--surface-1", "--surface-2", "--surface-3"],
    "--text-3": ["--surface-0", "--surface-1", "--surface-2"],
    "--danger": ["--surface-0", "--surface-1", "--surface-2", "--surface-3"],
    "--notice": ["--surface-0", "--surface-1", "--surface-2", "--surface-3"],
    "--ok": ["--surface-0", "--surface-1", "--surface-2", "--surface-3"],
  };
  for (const [fg, surfaces] of Object.entries(textSurfaces)) {
    for (const surface of surfaces) {
      it(`${fg} on ${surface} meets 4.5:1`, () => {
        expect(contrastRatio(solid(fg), solid(surface))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("--text-3 on --surface-1 (an unavailable Settings row label) meets 4.5:1", () => {
    expect(contrastRatio(solid("--text-3"), solid("--surface-1"))).toBeGreaterThanOrEqual(4.5);
  });

  it("--text-3 is not for surface-3 (below 4.5:1 there)", () => {
    expect(contrastRatio(solid("--text-3"), solid("--surface-3"))).toBeLessThan(4.5);
  });

  it("holds the documented surface ramp", () => {
    expect(token("--surface-0")).toBe("#0b0c0e");
    expect(token("--text-1")).toBe("#f2efe9");
    expect(token("--focus")).toBe("#fff4dc");
  });
});

describe("hero contrast proofs (DESIGN.md §11.1)", () => {
  it("--text-2 on the nav band over white art meets 4.5:1", () => {
    const nav = token("--scrim-nav");
    const match = /rgb\(11 12 14 \/ ([\d.]+)\) 50%/.exec(nav);
    expect(match).not.toBeNull();
    const alpha = Number(match?.[1]);
    const bg = composite(solid("--surface-0"), alpha, [255, 255, 255]);
    expect(contrastRatio(solid("--text-2"), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("paints --scrim-nav above the glow, so the proof holds over the glow too", () => {
    const css = readFileSync(join(__dirname, "../features/shared/ui/hero.css"), "utf8");
    const layer = (selector: string) => {
      const block = new RegExp(`\\.hero-art::${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      return { z: Number(/z-index:\s*(\d+)/.exec(block)?.[1]), background: /background:([^;]*);/.exec(block)?.[1] ?? "" };
    };
    const glow = layer("before");
    const nav = layer("after");
    expect(glow.background).toContain("var(--art-glow)");
    expect(nav.background).toContain("var(--scrim-nav)");
    expect(nav.z).toBeGreaterThan(glow.z);
  });

  it("--text-1 on white art at the text column edge (42.5% of the width) meets 4.5:1", () => {
    const scrim = token("--scrim-hero");
    const stops = [...scrim.matchAll(/rgb\(11 12 14 \/ ([\d.]+)\) ([\d.]+)%/g)].map((m) => ({ alpha: Number(m[1]), at: Number(m[2]) }));
    const before = stops.filter((stop) => stop.at <= 42.5).at(-1);
    const after = stops.find((stop) => stop.at > 42.5);
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    if (!before || !after) return;
    const alpha = before.alpha + ((after.alpha - before.alpha) * (42.5 - before.at)) / (after.at - before.at);
    const bg = composite(solid("--surface-0"), alpha, [255, 255, 255]);
    expect(contrastRatio(solid("--text-1"), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("TV form type floor", () => {
  const tvBlock = /:root\[data-form="tv"\] \{([\s\S]*?)\n\}/.exec(tokensCss)?.[1] ?? "";
  it.each(["--type-mono", "--type-meta"])("%s renders at 22px or more at 24px root", (name) => {
    const match = new RegExp(`${name}:\\s*\\d+ ([\\d.]+)rem`).exec(tvBlock);
    expect(match, `${name} in the TV block`).not.toBeNull();
    expect(Number(match![1]) * 24).toBeGreaterThanOrEqual(22);
  });
});
