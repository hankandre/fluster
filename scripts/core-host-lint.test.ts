// @vitest-environment node
// T2-03 acceptance item 4: a lint fails on a direct use of the wall clock, a timer, crypto or Math.random in core
// source outside the ports' adapters.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Each case spawns ESLint or dependency-cruiser; the default 5 s is too tight.
const TIMEOUT = 60_000;
const ESLINT = ["--import", "./scripts/typescript-6-resolve.mjs", "node_modules/eslint/bin/eslint.js", "--max-warnings", "0"];

function eslintStdin(path: string, code: string): { status: number | null; output: string } {
  const child = spawnSync(process.execPath, [...ESLINT, "--stdin", "--stdin-filename", path], {
    cwd: repo,
    input: code,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
}

const PLAYER = "packages/core/src/player/probe.ts";
const ADAPTER = "packages/core/src/adapters/probe.ts";

describe("core host lint: clock and crypto stay behind the ports", () => {
  const banned: [string, string, RegExp][] = [
    ["Date.now()", "export const at = Date.now();\n", /Clock/],
    ["setTimeout", "export const t = setTimeout(() => undefined, 1);\n", /Clock/],
    ["crypto", "export const id = crypto.randomUUID();\n", /Crypto/],
    ["Math.random()", "export const r = Math.random();\n", /Crypto/],
    ["globalThis.setTimeout", "export const t = globalThis.setTimeout(() => undefined, 1);\n", /Clock/],
    ["new Date()", "export const now = new Date();\n", /Clock/],
  ];

  it.each(banned)(
    "rejects %s in a player file and names the port",
    (_name, code, port) => {
      const { status, output } = eslintStdin(PLAYER, code);
      expect(status).not.toBe(0);
      expect(output).toMatch(port);
    },
    TIMEOUT,
  );

  it.each(banned)(
    "accepts %s in an adapter",
    (_name, code) => {
      const { status, output } = eslintStdin(ADAPTER, code);
      expect(output).not.toMatch(/error/);
      expect(status).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "still rejects a browser global in an adapter",
    () => {
      const { status, output } = eslintStdin(ADAPTER, "export const href = window.location.href;\n");
      expect(status).not.toBe(0);
      expect(output).toMatch(/window|location/);
    },
    TIMEOUT,
  );

  it(
    "accepts parsing a date: Date.parse and new Date(value)",
    () => {
      const { status, output } = eslintStdin(PLAYER, 'export const a = Date.parse("2026-01-01");\nexport const b = new Date("2026-01-01");\n');
      expect(output).not.toMatch(/error/);
      expect(status).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "passes pnpm lint on the repository",
    () => {
      const child = spawnSync(process.execPath, [...ESLINT, "packages/core/src"], { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      expect(`${child.stdout}${child.stderr}`).not.toMatch(/error/);
      expect(child.status).toBe(0);
    },
    TIMEOUT * 2,
  );
});

describe("core host lint: dependency-cruiser core-takes-adapters-by-injection", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  });

  function tree(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "octave-core-adapters-"));
    roots.push(dir);
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { module: "ESNext", moduleResolution: "Bundler", target: "ES2023", strict: true, noEmit: true } }),
    );
    const all: Record<string, string> = {
      "packages/core/src/adapters/system-clock.ts": "export const systemClock = 1;\n",
      ...files,
    };
    for (const [path, text] of Object.entries(all)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return dir;
  }

  function cruise(root: string): { status: number | null; output: string } {
    const child = spawnSync(process.execPath, ["scripts/lint-boundaries.mjs", "--root", root], { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
  }

  it(
    "fails a non-test core file that imports an adapter",
    () => {
      const { status, output } = cruise(tree({ "packages/core/src/player/x.ts": 'import { systemClock } from "../adapters/system-clock";\nexport const x = systemClock;\n' }));
      expect(status).not.toBe(0);
      expect(output).toContain("core-takes-adapters-by-injection");
    },
    TIMEOUT,
  );

  it(
    "lets a core test import an adapter",
    () => {
      const { status, output } = cruise(
        tree({
          "packages/core/src/player/x.ts": "export const x = 1;\n",
          "packages/core/src/player/x.test.ts": 'import { systemClock } from "../adapters/system-clock";\nexport const y = systemClock;\n',
        }),
      );
      expect(output).not.toContain("core-takes-adapters-by-injection");
      expect(status).toBe(0);
    },
    TIMEOUT,
  );
});
