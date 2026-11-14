// @vitest-environment node
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script with no declaration file
import { findLintGaps, listSourceFiles } from "./lint-boundaries.mjs";

type Result = {
  summary: { totalCruised: number; environment?: { issues?: { name: string }[] } };
  modules: { source: string }[];
};

const files = ["src/domain/a.ts", "src/lib/b.ts"];
const clean: Result = {
  summary: { totalCruised: 2 },
  modules: files.map((source) => ({ source })),
};
const gaps = findLintGaps as (result: Result, sourceFiles: string[]) => string[];

describe("findLintGaps", () => {
  it("flags a run that checked zero modules, with the fix line", () => {
    const messages = gaps({ summary: { totalCruised: 0 }, modules: [] }, []);
    expect(messages.join("\n")).toContain("checked 0 modules");
    expect(messages.at(-1)).toMatch(/^Fix: run pnpm install/);
  });

  it("names a dependency-cruiser environment issue", () => {
    const messages = gaps(
      { ...clean, summary: { totalCruised: 2, environment: { issues: [{ name: "missing-tsc-transpiler" }] } } },
      files,
    );
    expect(messages.join("\n")).toContain("missing-tsc-transpiler");
    expect(messages.at(-1)).toMatch(/^Fix:/);
  });

  it("names a source file that was not read", () => {
    const messages = gaps({ ...clean, modules: [{ source: "src/lib/b.ts" }] }, files);
    expect(messages.join("\n")).toContain("did not read src/domain/a.ts");
  });

  it("names 20 missing files, then counts the rest", () => {
    const many = Array.from({ length: 25 }, (_, index) => `src/m/f${index}.ts`);
    const messages = gaps({ summary: { totalCruised: 1 }, modules: [{ source: "src/x.ts" }] }, many);
    expect(messages.filter((message) => message.includes("did not read src/"))).toHaveLength(20);
    expect(messages.join("\n")).toContain("and 5 more");
  });

  it("returns nothing for a clean result whose environment field is absent", () => {
    expect(gaps(clean, files)).toEqual([]);
  });

  it("returns nothing when only rule violations are present", () => {
    const withViolations = {
      ...clean,
      summary: { ...clean.summary, violations: [{ rule: { name: "domain-is-pure" } }] },
    };
    expect(gaps(withViolations, files)).toEqual([]);
  });
});

describe("importing the wrapper", () => {
  it("does not run dependency-cruiser", () => {
    expect(typeof listSourceFiles).toBe("function");
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", 'await import("./scripts/lint-boundaries.mjs"); console.log("imported");'],
      { encoding: "utf8" },
    );
    expect(child.stdout.trim()).toBe("imported");
  });
});
