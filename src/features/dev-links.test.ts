import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Acceptance for P13-06: no user flow links to the developer feature index (#/next). Only the index itself
// (src/features/index.tsx) and the route table (src/features/routes.ts) may name it, and only App.tsx
// renders FEATURE_INDEX_ROUTE (P2-10).
const DEV_LINK = /(["'`])#\/next\1/;

const featuresDir = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("developer feature index links", () => {
  it("matches the string literals it must catch and not the Home route", () => {
    expect(DEV_LINK.test('href="#/next"')).toBe(true);
    expect(DEV_LINK.test('libraryId ? "#/next/home" : "#/next"')).toBe(true);
    expect(DEV_LINK.test("`#/next`")).toBe(true);
    expect(DEV_LINK.test('"#/next/home"')).toBe(false);
  });

  it("appear in no feature file except the index and the route table", () => {
    const offenders = sourceFiles(featuresDir)
      .map((file) => relative(featuresDir, file).split("\\").join("/"))
      .filter((file) => file !== "index.tsx" && file !== "routes.ts")
      .filter((file) => DEV_LINK.test(readFileSync(join(featuresDir, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("is named by FEATURE_INDEX_ROUTE in no feature file except the route table", () => {
    const offenders = sourceFiles(featuresDir)
      .map((file) => relative(featuresDir, file).split("\\").join("/"))
      .filter((file) => file !== "routes.ts")
      .filter((file) => readFileSync(join(featuresDir, file), "utf8").includes("FEATURE_INDEX_ROUTE"));
    expect(offenders).toEqual([]);
  });
});
