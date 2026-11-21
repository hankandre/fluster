// @vitest-environment node
// T2-02 acceptance item 3: the import-boundary lint runs on packages/core and fails when the domain imports
// anything outside itself, or when a core file imports React, React Native, Expo or a platform API.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Each case spawns dependency-cruiser; the default 5 s is too tight on CI.
const TIMEOUT = 60_000;

const TSCONFIG = JSON.stringify({
  compilerOptions: { module: "ESNext", moduleResolution: "Bundler", target: "ES2023", strict: true, noEmit: true },
});

const BASE: Record<string, string> = {
  "packages/core/src/domain/ok.ts": "export const ok = 1;\nexport type X = { ok: number };\n",
  "packages/core/src/jellyfin/uses-domain.ts": 'import { ok } from "../domain/ok";\nexport type X = { n: number };\nexport const twice = ok * 2;\n',
};

const roots: string[] = [];

function makeTree(extra: Record<string, string>, base: Record<string, string> = BASE): string {
  const dir = mkdtempSync(join(tmpdir(), "octave-core-boundaries-"));
  roots.push(dir);
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  for (const [path, text] of Object.entries({ ...base, ...extra })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function lint(root?: string): { status: number | null; output: string } {
  const args = ["scripts/lint-boundaries.mjs", ...(root === undefined ? [] : ["--root", root])];
  const child = spawnSync(process.execPath, args, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("lint:boundaries on a temporary core tree", () => {
  it(
    "passes a clean tree and reads its files under packages/core/src",
    () => {
      const { status, output } = lint(makeTree({}));
      expect(output).toMatch(/2\/2 source files under packages\/core\/src/);
      expect(status).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "fails when the domain imports core code outside the domain",
    () => {
      const { status, output } = lint(
        makeTree({ "packages/core/src/domain/bad.ts": 'import { twice } from "../jellyfin/uses-domain";\nexport const bad = twice;\n' }),
      );
      expect(status).not.toBe(0);
      expect(output).toContain("domain-is-pure");
    },
    TIMEOUT,
  );

  it(
    "counts a type-only import from the domain",
    () => {
      const { status, output } = lint(
        makeTree({ "packages/core/src/domain/bad.ts": 'import type { X } from "../jellyfin/uses-domain";\nexport type Bad = X;\n' }),
      );
      expect(status).not.toBe(0);
      expect(output).toContain("domain-is-pure");
    },
    TIMEOUT,
  );

  it(
    "fails when the domain imports an npm package that is not installed",
    () => {
      const { status, output } = lint(
        makeTree({ "packages/core/src/domain/bad.ts": 'import leftPad from "left-pad";\nexport const bad = leftPad;\n' }),
      );
      expect(status).not.toBe(0);
      expect(output).toContain("domain-is-pure");
    },
    TIMEOUT,
  );

  it(
    "fails when the domain imports a Node builtin",
    () => {
      const { status, output } = lint(
        makeTree({ "packages/core/src/domain/bad.ts": 'import { randomUUID } from "node:crypto";\nexport const bad = randomUUID;\n' }),
      );
      expect(status).not.toBe(0);
      expect(output).toMatch(/domain-is-pure|core-has-no-host-builtins/);
    },
    TIMEOUT,
  );

  for (const name of ["react", "react-native", "expo-video", "@expo/vector-icons"]) {
    it(
      `fails when a core file imports ${name}, even though it is not installed`,
      () => {
        const { status, output } = lint(
          makeTree({ "packages/core/src/jellyfin/bad.ts": `import * as platform from "${name}";\nexport const bad = platform;\n` }),
        );
        expect(status).not.toBe(0);
        expect(output).toContain("core-is-platform-free");
      },
      TIMEOUT,
    );
  }

  it(
    "fails when a core file imports a Node builtin",
    () => {
      const { status, output } = lint(
        makeTree({ "packages/core/src/jellyfin/bad.ts": 'import { readFileSync } from "node:fs";\nexport const bad = readFileSync;\n' }),
      );
      expect(status).not.toBe(0);
      expect(output).toContain("core-has-no-host-builtins");
    },
    TIMEOUT,
  );

  it(
    "lets a core test import a Node builtin",
    () => {
      const { status, output } = lint(
        makeTree({ "packages/core/src/jellyfin/bad.test.ts": 'import { readFileSync } from "node:fs";\nexport const read = readFileSync;\n' }),
      );
      expect(output).toMatch(/2\/2 source files under packages\/core\/src/);
      expect(status).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "fails when packages/core/src holds no module",
    () => {
      // One TypeScript file outside the core keeps tsc from stopping with "No inputs were found".
      const dir = makeTree({ "other/keep.ts": "export const keep = 1;\n" }, {});
      mkdirSync(join(dir, "packages", "core", "src"), { recursive: true });
      const { status, output } = lint(dir);
      expect(status).not.toBe(0);
      expect(output).toContain("checked 0 modules");
    },
    TIMEOUT,
  );
});

describe("lint:boundaries on the repository", () => {
  it(
    "passes and reads every source file under packages/core/src",
    () => {
      const { status, output } = lint();
      const match = /(\d+)\/(\d+) source files under packages\/core\/src/.exec(output);
      expect(match, output).not.toBeNull();
      expect(match?.[1]).toBe(match?.[2]);
      expect(Number(match?.[1])).toBeGreaterThanOrEqual(43);
      expect(status).toBe(0);
    },
    TIMEOUT,
  );
});
