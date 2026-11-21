// @vitest-environment node
// T2-10 acceptance item 2: a fake node_modules/react symlinked into the temporary root exercises the rule's resolved branch.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT = 60_000;
const TSCONFIG = JSON.stringify({
  compilerOptions: { module: "ESNext", moduleResolution: "Bundler", target: "ES2023", strict: true, noEmit: true },
});
const roots: string[] = [];

function fakeReact(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "react", version: "0.0.0", main: "index.js" }));
  writeFileSync(join(dir, "index.js"), "module.exports = {};\n");
}

function makeRoot(layout: "pnpm" | "linked-out", importer: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "octave-core-resolved-")));
  roots.push(dir);
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  if (layout === "pnpm") {
    fakeReact(join(dir, "node_modules/.pnpm/react@0.0.0/node_modules/react"));
    symlinkSync(".pnpm/react@0.0.0/node_modules/react", join(dir, "node_modules/react"), "dir");
  } else {
    fakeReact(join(dir, "vendor/react"));
    symlinkSync("../vendor/react", join(dir, "node_modules/react"), "dir");
  }
  mkdirSync(join(dir, "packages/core/src/jellyfin"), { recursive: true });
  writeFileSync(join(dir, "packages/core/src/jellyfin", importer), 'import react from "react";\nexport const r = react;\n');
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

describe("core-is-platform-free on a symlinked node_modules/react", () => {
  for (const file of ["bad.ts", "bad.test.ts"]) {
    it(
      `fails a pnpm-layout link imported from ${file}`,
      () => {
        const { status, output } = lint(makeRoot("pnpm", file));
        expect(status).toBe(1);
        expect(output).toContain("core-is-platform-free");
        expect(output).toContain("node_modules/.pnpm/react@0.0.0/node_modules/react/index.js");
      },
      TIMEOUT,
    );
  }

  it(
    "fails a link whose target lies outside node_modules",
    () => {
      const { status, output } = lint(makeRoot("linked-out", "bad.ts"));
      expect(status).toBe(1);
      expect(output).toContain("core-is-platform-free");
      expect(output).toContain("vendor/react/index.js");
    },
    TIMEOUT,
  );
});
