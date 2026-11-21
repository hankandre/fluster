// @vitest-environment node
// T2-02 acceptance item 3 for core test files: they may import Node builtins and other core folders,
// but, like every core file, never React, React Native or Expo.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Each case spawns dependency-cruiser; the default 5 s is too tight on CI.
const TIMEOUT = 60_000;
const roots: string[] = [];

function lintTree(files: Record<string, string>): { status: number | null; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "octave-core-test-files-"));
  roots.push(dir);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { module: "ESNext", moduleResolution: "Bundler", strict: true, noEmit: true } }));
  const tree = {
    "packages/core/src/domain/ok.ts": "export const ok = 1;\n",
    "packages/core/src/jellyfin/uses-domain.ts": 'import { ok } from "../domain/ok";\nexport const twice = ok * 2;\n',
    ...files,
  };
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const child = spawnSync(process.execPath, ["scripts/lint-boundaries.mjs", "--root", dir], { cwd: repo, encoding: "utf8" });
  return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("lint:boundaries on core test files", () => {
  for (const name of ["react", "react-native", "expo-video"]) {
    it(
      `fails when a core test imports ${name}`,
      () => {
        const { status, output } = lintTree({
          "packages/core/src/jellyfin/bad.test.ts": `import * as platform from "${name}";\nexport const bad = platform;\n`,
        });
        expect(status).not.toBe(0);
        expect(output).toContain("core-is-platform-free");
      },
      TIMEOUT,
    );
  }

  it(
    "lets a domain test import another core folder",
    () => {
      const { status, output } = lintTree({
        "packages/core/src/domain/ok.test.ts": 'import { twice } from "../jellyfin/uses-domain";\nexport const used = twice;\n',
      });
      expect(output).toMatch(/2\/2 source files under packages\/core\/src/);
      expect(status).toBe(0);
    },
    TIMEOUT,
  );
});
