import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The player draws over a transparent native surface: blur would sample nothing
// and cost frames (DESIGN.md §3, audit P-10).
const playerDir = join(__dirname, "..");
const stylesheet = join(__dirname, "../../../styles.css");

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

describe("player CSS", () => {
  it("has a stylesheet", () => {
    expect(cssFiles(playerDir).map((file) => file.slice(playerDir.length + 1))).toContain("chrome/player.css");
  });

  it("uses no backdrop-filter in the player or the global stylesheet", () => {
    for (const file of [...cssFiles(playerDir), stylesheet]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/backdrop-filter/);
    }
  });

  it("stops the control row at the sheet edge while a sheet is open", () => {
    const css = readFileSync(join(__dirname, "player.css"), "utf8");
    expect(css).toMatch(/\.player-controls\[data-sheet-open\]\s*\{[^}]*padding-right:[^}]*var\(--player-sheet-w\)/);
  });

  it("holds the status ring still under reduced motion", () => {
    const css = readFileSync(join(__dirname, "player.css"), "utf8");
    const blocks = reducedMotionBlocks(css);
    expect(blocks.some((block) => /\.player-status-ring\s*\{[^}]*animation:\s*none/.test(block))).toBe(true);
    for (const block of blocks) expect(block).not.toMatch(/infinite/);
  });
});

// The bodies of every `@media (prefers-reduced-motion: reduce)` block, found by balancing braces.
function reducedMotionBlocks(css: string): string[] {
  const blocks: string[] = [];
  const marker = "@media (prefers-reduced-motion: reduce)";
  let from = css.indexOf(marker);
  while (from !== -1) {
    const open = css.indexOf("{", from);
    let depth = 1;
    let index = open + 1;
    while (depth > 0 && index < css.length) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push(css.slice(open + 1, index - 1));
    from = css.indexOf(marker, index);
  }
  return blocks;
}
