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

function frontendRunSteps(ciYaml: string): string[] {
  const lines = ciYaml.split("\n");
  const start = lines.findIndex((line) => line === "  frontend:");
  if (start === -1) {
    throw new Error("ERROR ci parity: no 'frontend:' job found in ci.yml");
  }
  const steps: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^  \S/.test(line)) break;
    const match = /^\s+(?:- )?run:\s*(.+)$/.exec(line);
    if (!match) continue;
    const value = match[1].trim();
    if (value.startsWith("|") || value.startsWith(">")) {
      throw new Error(
        "ERROR ci parity: the frontend job has a multi-line run step; this test reads single-line run steps only",
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
        `ERROR ci parity: pnpm check runs '${step}' but CI's frontend job does not. Add '- run: ${step}' to the frontend job in .github/workflows/ci.yml in pnpm check's order.`,
    );
  if (missing.length > 0) return missing;
  const ciOrder = ci.filter((step) => check.includes(step));
  const inOrder = check.every((step, i) => ciOrder[i] === step);
  if (inOrder) return [];
  return [
    `ERROR ci parity: CI's frontend job runs pnpm check's steps in a different order: ${ciOrder.join(", ")}; pnpm check order: ${check.join(", ")}.`,
  ];
}

const ci = (jobBody: string, after = "") =>
  `jobs:\n  frontend:\n    steps:\n${jobBody}\n${after}`;

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

describe("frontendRunSteps", () => {
  it("reads single-line run steps in order, with or without a name", () => {
    const yaml = ci("      - run: pnpm a\n      - name: x\n        run: pnpm b # note");
    expect(frontendRunSteps(yaml)).toEqual(["pnpm a", "pnpm b"]);
  });

  it("throws on a block scalar run in the frontend job", () => {
    expect(() => frontendRunSteps(ci("      - run: |\n          pnpm a"))).toThrow(
      "multi-line run step",
    );
  });

  it("ignores a block scalar run in another job", () => {
    const yaml = ci("      - run: pnpm a", "  other:\n    steps:\n      - run: |\n          x");
    expect(frontendRunSteps(yaml)).toEqual(["pnpm a"]);
  });

  it("does not count steps from a later job", () => {
    const yaml = ci("      - run: pnpm a", "  other:\n    steps:\n      - run: pnpm z");
    expect(frontendRunSteps(yaml)).toEqual(["pnpm a"]);
  });

  it("throws when there is no frontend job", () => {
    expect(() => frontendRunSteps("jobs:\n  other:\n")).toThrow("no 'frontend:' job");
  });

  it("cuts a run value that contains ' #', which then fails as a missing step", () => {
    const steps = frontendRunSteps(ci('      - run: pnpm a "x #y"'));
    expect(findParityGaps(['pnpm a "x #y"'], steps)).toHaveLength(1);
  });
});

describe("real files", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const pkg = JSON.parse(read("../package.json")) as { scripts: { check: string } };
  const ciSteps = frontendRunSteps(read("../.github/workflows/ci.yml"));

  it("runs every non-Rust pnpm check step in the frontend job, in order", () => {
    expect(findParityGaps(nonRustSteps(checkSteps(pkg.scripts.check)), ciSteps)).toEqual([]);
  });

  it("runs the guards directly after build and before e2e", () => {
    const at = (step: string) => ciSteps.indexOf(step);
    const order = [
      "pnpm build",
      "pnpm test:no-test-engine",
      "pnpm typecheck:integration",
      "pnpm typecheck:core",
      "pnpm test:e2e",
    ];
    expect(order.map(at).every((i) => i !== -1)).toBe(true);
    expect(ciSteps[at("pnpm build") + 1]).toBe("pnpm test:no-test-engine");
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
  });
});
