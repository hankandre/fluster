// @vitest-environment node
// T2-03 acceptance item 1: the core compiles without Node's type package, and a host-globals file declares exactly
// the globals the core source uses.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-6";
import { afterAll, describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = join(repo, "packages/core");
const packageTsconfig = join(core, "tsconfig.json");
const hostGlobals = join(core, "host-globals.d.ts");
// Each case spawns tsc over the whole core package.
const TIMEOUT = 120_000;

const roots: string[] = [];

function tsc(args: string[]): { status: number | null; output: string } {
  const child = spawnSync("pnpm", ["exec", "tsc", ...args], { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
}

function tempProject(compilerOptions: Record<string, unknown>, include: string[], exclude: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), "octave-host-contract-"));
  roots.push(dir);
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ extends: packageTsconfig, compilerOptions, include, exclude }),
  );
  return dir;
}

// Every top-level declaration name of every kind, so a type-only global such as Blob counts.
function declaredNames(file: string): Set<string> {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    } else if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isModuleDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name && ts.isIdentifier(statement.name)) names.add(statement.name.text);
    }
  }
  return names;
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("core host contract", () => {
  it(
    "compiles the core package without any @types/node file",
    () => {
      const { status, output } = tsc(["-p", packageTsconfig, "--listFiles"]);
      expect(output).not.toMatch(/error TS\d+/);
      expect(status).toBe(0);
      expect(output).not.toContain("@types/node");
    },
    TIMEOUT,
  );

  it("sets types to [] in the package tsconfig and drops @types/node from the package manifest", () => {
    const config = JSON.parse(readFileSync(packageTsconfig, "utf8")) as { compilerOptions?: { types?: unknown } };
    expect(config.compilerOptions?.types).toEqual([]);
    const manifest = JSON.parse(readFileSync(join(core, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      expect(Object.keys(manifest[field] ?? {})).not.toContain("@types/node");
    }
  });

  it(
    "declares exactly the globals the core source needs, and no others",
    () => {
      const declared = declaredNames(hostGlobals);
      expect(declared.size).toBeGreaterThan(0);
      const dir = tempProject({}, [join(core, "src/**/*.ts")], [join(core, "**/*.test.ts")]);
      const { output } = tsc(["-p", join(dir, "tsconfig.json"), "--pretty", "false", "--noEmit"]);
      const missing = new Set<string>();
      for (const match of output.matchAll(/Cannot find name '([^']+)'/g)) missing.add(match[1]!);
      expect([...missing].sort()).toEqual([...declared].sort());
    },
    TIMEOUT,
  );

  it(
    "rejects a Node-only global in core code",
    () => {
      const dir = tempProject({}, [hostGlobals]);
      writeFileSync(join(dir, "probe.ts"), 'export const home = process.env.HOME;\nexport const bytes = Buffer.from("x");\n');
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({ extends: packageTsconfig, include: [join(dir, "probe.ts"), hostGlobals] }),
      );
      const { status, output } = tsc(["-p", join(dir, "tsconfig.json"), "--pretty", "false", "--noEmit"]);
      expect(status).not.toBe(0);
      expect(output).toMatch(/Cannot find name '(process|Buffer)'/);
    },
    TIMEOUT,
  );
});
