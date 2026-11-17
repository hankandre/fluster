import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Acceptance for P2-10: every route is built and parsed in src/features/routes.ts. No other file under src/
// outside tests spells the route prefix, and the sign-in route is declared once.
const srcDir = join(__dirname, "..");
const PREFIX = "#/next";

function isTestFile(name: string): boolean {
  return /\.test\.tsx?$/.test(name);
}

function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return allFiles(path);
    return isTestFile(name) ? [] : [path];
  });
}

const files = allFiles(srcDir).map((file) => relative(srcDir, file).split("\\").join("/"));
const names = (hash: string) => hash.includes(PREFIX);

describe("route literals", () => {
  it("finds the source files and the predicate catches a route", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("test/arm-return.ts");
    expect(files).toContain("app/App.tsx");
    expect(names('"#/next/home"')).toBe(true);
    expect(names("#/probe")).toBe(false);
  });

  it("appear in no file except the route table", () => {
    const offenders = files.filter((file) => names(readFileSync(join(srcDir, file), "utf8")));
    expect(offenders).toEqual(["features/routes.ts"]);
  });

  it("declares the sign-in route once", () => {
    const routes = readFileSync(join(srcDir, "features/routes.ts"), "utf8");
    expect(routes.split("#/next/sign-in")).toHaveLength(2);
  });
});
