// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function checkSteps(checkScript: string): string[] {
  return checkScript.split(" && ").map((part) => {
    const step = part.trim();
    const unreadable =
      /;|\|\||\||\n/.test(step) || !(step.startsWith("pnpm ") || step.startsWith("cargo "));
    if (unreadable) {
      throw new Error(
        `ERROR ci parity: pnpm check must be steps joined by ' && '; cannot read: ${step}`,
      );
    }
    return step;
  });
}

function nonRustSteps(steps: string[]): string[] {
  return steps.filter((step) => !step.startsWith("cargo "));
}

function checksRunSteps(ciYaml: string): string[] {
  const lines = ciYaml.split("\n");
  const start = lines.findIndex((line) => line === "  checks:");
  if (start === -1) {
    throw new Error("ERROR ci parity: no 'checks:' job found in ci.yml");
  }
  const steps: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^  \S/.test(line)) break;
    const match = /^\s+(?:- )?run:\s*(.+)$/.exec(line);
    if (!match) continue;
    const value = match[1].trim();
    if (value.startsWith("|") || value.startsWith(">")) {
      throw new Error(
        "ERROR ci parity: the checks job has a multi-line run step; this test reads single-line run steps only",
      );
    }
    // A run value that itself contains ' #' is cut here and then fails as a missing step.
    steps.push(value.replace(/\s+#.*$/, "").trim());
  }
  return steps;
}

function findParityGaps(check: string[], ci: string[]): string[] {
  const missing = check
    .filter((step) => !ci.includes(step))
    .map(
      (step) =>
        `ERROR ci parity: pnpm check runs '${step}' but CI's checks job does not. Add '- run: ${step}' to the checks job in .github/workflows/ci.yml in pnpm check's order.`,
    );
  if (missing.length > 0) return missing;
  const ciOrder = ci.filter((step) => check.includes(step));
  const inOrder = check.every((step, i) => ciOrder[i] === step);
  if (inOrder) return [];
  return [
    `ERROR ci parity: CI's checks job runs pnpm check's steps in a different order: ${ciOrder.join(", ")}; pnpm check order: ${check.join(", ")}.`,
  ];
}

const ci = (jobBody: string, after = "") =>
  `jobs:\n  checks:\n    steps:\n${jobBody}\n${after}`;

describe("findParityGaps", () => {
  it("reports a check step that CI lacks, by name", () => {
    const gaps = findParityGaps(["pnpm test", "pnpm lint:new"], ["pnpm test"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("'pnpm lint:new'");
  });

  it("reports CI steps in a different order", () => {
    const gaps = findParityGaps(["pnpm a", "pnpm b"], ["pnpm b", "pnpm a"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("different order");
  });

  it("accepts extra CI steps that pnpm check lacks", () => {
    expect(findParityGaps(["pnpm a"], ["pnpm install", "pnpm a"])).toEqual([]);
  });
});

describe("checkSteps and nonRustSteps", () => {
  it("ignores cargo steps", () => {
    const steps = checkSteps("pnpm a && cargo test --manifest-path x");
    expect(nonRustSteps(steps)).toEqual(["pnpm a"]);
  });

  it.each(["pnpm a; pnpm b", "pnpm a || pnpm b", "pnpm a && node x.js", "pnpm a | cat"])(
    "throws on a script it cannot read: %s",
    (script) => {
      expect(() => checkSteps(script)).toThrow("ERROR ci parity");
    },
  );
});

describe("checksRunSteps", () => {
  it("reads single-line run steps in order, with or without a name", () => {
    const yaml = ci("      - run: pnpm a\n      - name: x\n        run: pnpm b # note");
    expect(checksRunSteps(yaml)).toEqual(["pnpm a", "pnpm b"]);
  });

  it("throws on a block scalar run in the checks job", () => {
    expect(() => checksRunSteps(ci("      - run: |\n          pnpm a"))).toThrow(
      "multi-line run step",
    );
  });

  it("ignores a block scalar run in another job", () => {
    const yaml = ci("      - run: pnpm a", "  other:\n    steps:\n      - run: |\n          x");
    expect(checksRunSteps(yaml)).toEqual(["pnpm a"]);
  });

  it("does not count steps from a later job", () => {
    const yaml = ci("      - run: pnpm a", "  other:\n    steps:\n      - run: pnpm z");
    expect(checksRunSteps(yaml)).toEqual(["pnpm a"]);
  });

  it("throws when there is no checks job", () => {
    expect(() => checksRunSteps("jobs:\n  other:\n")).toThrow("no 'checks:' job");
  });

  it("cuts a run value that contains ' #', which then fails as a missing step", () => {
    const steps = checksRunSteps(ci('      - run: pnpm a "x #y"'));
    expect(findParityGaps(['pnpm a "x #y"'], steps)).toHaveLength(1);
  });
});

describe("real files", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const pkg = JSON.parse(read("../package.json")) as { scripts: { check: string } };
  const ciSteps = checksRunSteps(read("../.github/workflows/ci.yml"));

  it("runs every pnpm check step in the checks job, in order", () => {
    expect(findParityGaps(nonRustSteps(checkSteps(pkg.scripts.check)), ciSteps)).toEqual([]);
  });

  it("runs the ghost-term check, the type-check, and the workflow tests", () => {
    for (const step of ["pnpm lint:ghost-terms", "pnpm lint:flow", "pnpm typecheck", "pnpm test:workflow"]) {
      expect(ciSteps).toContain(step);
    }
  });

  it("clones the checks job with full history, which the frozen-test check needs", () => {
    const lines = read("../.github/workflows/ci.yml").split("\n");
    const job = lines.slice(lines.findIndex((line) => line === "  checks:") + 1);
    const checkout = job.findIndex((line) => line.includes("actions/checkout"));
    const end = job.findIndex((line, i) => i > checkout && /^\s+- /.test(line));
    expect(checkout).toBeGreaterThan(-1);
    expect(job.slice(checkout, end).join("\n")).toMatch(/fetch-depth: 0/);
  });
});
