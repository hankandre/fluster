import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The TV journeys drive the page the way a remote does: arrows, Enter, Escape, Backspace, Menu, and the
// on-screen keyboard's insertText. Pointer calls, Tab, and direct focus or fill calls would hide a screen that a
// D-pad cannot use, so any of them fails here (P13-18).
const directory = join(__dirname, "../../e2e/tv");
const BANNED = [
  /\.click\(/,
  /\.hover\(/,
  /\.dblclick\(/,
  /page\.mouse/,
  /\.tap\(/,
  /\.fill\(/,
  /\.focus\(/,
  /press\("Tab"\)/,
  /press\("Shift\+Tab"\)/,
  /\.check\(/,
  /\.selectOption\(/,
];

const specs = readdirSync(directory).filter((name) => name.endsWith(".spec.ts"));

describe("TV journeys use no pointer or Tab API", () => {
  it("has journey files", () => {
    expect(specs.length).toBeGreaterThanOrEqual(6);
  });

  it.each(specs)("%s", (name) => {
    const source = readFileSync(join(directory, name), "utf8");
    for (const pattern of BANNED) expect(source, `${name} uses ${pattern}`).not.toMatch(pattern);
  });

  it("scans the support file too", () => {
    const source = readFileSync(join(directory, "support.ts"), "utf8");
    for (const pattern of BANNED) expect(source, `support.ts uses ${pattern}`).not.toMatch(pattern);
  });
});
