// @vitest-environment node
// T2-10 acceptance item 4: lint-boundaries exits 1 for any violation count, 256 included (exit codes wrap modulo 256).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT = 60_000;
const TSCONFIG = JSON.stringify({
  compilerOptions: { module: "ESNext", moduleResolution: "Bundler", target: "ES2023", strict: true, noEmit: true },
});
const roots: string[] = [];

function makeTree(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), "octave-lint-exit-"));
  roots.push(dir);
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  mkdirSync(join(dir, "packages/core/src/jellyfin"), { recursive: true });
  for (let i = 1; i <= count; i += 1) {
    writeFileSync(join(dir, `packages/core/src/jellyfin/f${i}.ts`), `import { readFileSync } from "node:fs";\nexport const f${i} = readFileSync;\n`);
  }
  return dir;
}

function lint(root: string): { status: number | null; output: string } {
  const child = spawnSync(process.execPath, ["scripts/lint-boundaries.mjs", "--root", root], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("lint:boundaries exit status", () => {
  it(
    "exits 1 for exactly 256 violations",
    () => {
      const { status, output } = lint(makeTree(256));
      expect(output).toContain("(256 errors, 0 warnings)");
      expect(status).toBe(1);
    },
    TIMEOUT,
  );

  it(
    "exits 1 for one violation",
    () => {
      const { status, output } = lint(makeTree(1));
      expect(output).toContain("(1 errors, 0 warnings)");
      expect(status).toBe(1);
    },
    TIMEOUT,
  );

  it(
    "exits 1 for 257 violations",
    () => {
      const { status } = lint(makeTree(257));
      expect(status).toBe(1);
    },
    TIMEOUT,
  );
});
