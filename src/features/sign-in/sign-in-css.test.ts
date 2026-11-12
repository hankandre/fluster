import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/features/sign-in/sign-in.css", "utf8");

describe("sign-in.css", () => {
  it("draws the Quick Connect code in the code token", () => {
    expect(css).toMatch(/\.sign-in-code\s*\{[^}]*font:\s*var\(--type-code\)/);
  });

  it("uses tokens only", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(css).not.toMatch(/\d\s*ms\b/);
  });
});
