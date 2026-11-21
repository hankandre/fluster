// @vitest-environment node
// T2-10 acceptance item 1: core-is-platform-free is an allowlist that rejects every npm package the core does not declare,
// in the core's tests as well as its source.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT = 60_000;

const TSCONFIG = JSON.stringify({
  compilerOptions: { module: "ESNext", moduleResolution: "Bundler", target: "ES2023", strict: true, noEmit: true, resolveJsonModule: true },
});

const roots: string[] = [];

function makeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "octave-core-allowlist-"));
  roots.push(dir);
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
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

const PLATFORM_PACKAGES = [
  "react-dom",
  "react-test-renderer",
  "@testing-library/react-native",
  "@react-navigation/native",
  "@shopify/flash-list",
  "react-native-svg",
  "@tanstack/react-query",
];

describe("core-is-platform-free allowlist", () => {
  for (const name of PLATFORM_PACKAGES) {
    for (const file of ["bad.ts", "bad.test.ts"]) {
      it(
        `rejects ${name} imported from ${file}`,
        () => {
          const { status, output } = lint(makeTree({ [`packages/core/src/jellyfin/${file}`]: `import * as x from "${name}";\nexport const y = x;\n` }));
          expect(status).toBe(1);
          expect(output).toContain("core-is-platform-free");
        },
        TIMEOUT,
      );
    }
  }

  it(
    "rejects an unlisted, non-platform package from a non-domain source file",
    () => {
      const { status, output } = lint(makeTree({ "packages/core/src/jellyfin/bad.ts": 'import pad from "left-pad";\nexport const y = pad;\n' }));
      expect(status).toBe(1);
      expect(output).toContain("core-is-platform-free");
    },
    TIMEOUT,
  );

  it(
    "passes a core test that imports vitest, a Node builtin, core code and a core fixture",
    () => {
      const { status, output } = lint(
        makeTree({
          "packages/core/src/domain/ok.ts": "export const ok = 1;\n",
          "packages/core/src/jellyfin/uses-domain.ts": 'import { ok } from "../domain/ok";\nexport const twice = ok * 2;\n',
          "packages/core/src/jellyfin/uses.test.ts":
            'import { readFileSync } from "node:fs";\nimport { expect, it } from "vitest";\nimport { ok } from "../domain/ok";\nimport fixture from "../../tests/fixtures/f.json";\nit("x", () => { expect([ok, fixture, readFileSync]).toBeDefined(); });\n',
          "packages/core/tests/fixtures/f.json": '{"a":1}\n',
        }),
      );
      expect(output).toMatch(/2\/2 source files under packages\/core\/src/);
      expect(output).not.toContain("core-is-platform-free");
      expect(status).toBe(0);
    },
    TIMEOUT,
  );

  it("has the allowlist form: to.pathNot admits the core's declared packages and no platform package", () => {
    const config = createRequire(import.meta.url)(resolve(repo, ".dependency-cruiser.cjs")) as {
      forbidden: { name: string; to: { pathNot?: string | string[] } }[];
    };
    const rule = config.forbidden.find((r) => r.name === "core-is-platform-free");
    expect(rule?.to.pathNot).toBeDefined();
    const raw = rule?.to.pathNot as string | string[];
    const patterns = (Array.isArray(raw) ? raw : [raw]).map((p) => new RegExp(p));
    const allowed = (path: string): boolean => patterns.some((p) => p.test(path));
    const pkg = JSON.parse(readFileSync(resolve(repo, "packages/core/package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) expect(allowed(`node_modules/${name}/index.js`), name).toBe(true);
    for (const name of ["react", "react-native", "@shopify/flash-list", "left-pad"]) {
      expect(allowed(`node_modules/${name}/index.js`), name).toBe(false);
    }
  });
});
