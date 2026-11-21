// @vitest-environment node
// T2-04 acceptance item 1, repository side: the gateway reaches the server only through the Transport port, so
// axios and the Jellyfin SDK are not dependencies and nothing imports them, only the reference adapter may call
// fetch, and every public gateway method has a row in the three tables that exercise "every call".
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-6";
import { describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = join(repo, "packages/core");
const TIMEOUT = 60_000;
const ESLINT = ["--import", "./scripts/typescript-6-resolve.mjs", "node_modules/eslint/bin/eslint.js", "--max-warnings", "0"];
const NAMES = ["axios", "@jellyfin/sdk"];
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

function manifest(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("axios and the Jellyfin SDK are not dependencies", () => {
  it.each([
    ["the root manifest", join(repo, "package.json")],
    ["the core manifest", join(core, "package.json")],
  ])("%s lists neither in any dependency field", (_label, path) => {
    const json = manifest(path);
    for (const field of DEPENDENCY_FIELDS) {
      const names = Object.keys((json[field] as Record<string, string> | undefined) ?? {});
      for (const name of NAMES) expect(names, `${field} of ${path}`).not.toContain(name);
    }
    const overrides = JSON.stringify((json.pnpm as Record<string, unknown> | undefined)?.overrides ?? {});
    for (const name of NAMES) expect(overrides).not.toContain(name);
  });

  it("pnpm-lock.yaml has no axios or @jellyfin/sdk package, snapshot or importer entry", () => {
    const lock = readFileSync(join(repo, "pnpm-lock.yaml"), "utf8");
    expect(lock).not.toMatch(/axios@/);
    expect(lock).not.toMatch(/@jellyfin\/sdk/);
    expect(lock).not.toMatch(/^\s+'?axios'?:/m);
  });

  it("no file under packages/core/src or tests/integration imports either", () => {
    const importer = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](axios|@jellyfin\/sdk)(?:\/[^"']*)?["']/;
    const offenders = [...sourceFiles(join(core, "src")), ...sourceFiles(join(repo, "tests/integration"))].filter((file) =>
      importer.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => file.slice(repo.length + 1))).toEqual([]);
  });
});

function eslintStdin(path: string, code: string): { status: number | null; output: string } {
  const child = spawnSync(process.execPath, [...ESLINT, "--stdin", "--stdin-filename", path], {
    cwd: repo,
    input: code,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
}

describe("fetch is confined to the adapters", () => {
  const GATEWAY = "packages/core/src/jellyfin/probe.ts";
  const ADAPTER = "packages/core/src/adapters/probe.ts";

  it(
    "rejects fetch in core source outside adapters and names the Transport",
    () => {
      const { status, output } = eslintStdin(GATEWAY, 'export const load = fetch("/x");\n');
      expect(status).not.toBe(0);
      expect(output).toMatch(/Transport/);
    },
    TIMEOUT,
  );

  it(
    "accepts fetch in an adapter",
    () => {
      const { status, output } = eslintStdin(ADAPTER, 'export const load = fetch("/x");\n');
      expect(output).not.toMatch(/error/);
      expect(status).toBe(0);
    },
    TIMEOUT,
  );

  it.each([
    ["globalThis.fetch", 'export const load = globalThis.fetch("/x");\n'],
    ["XMLHttpRequest", "export const request = new XMLHttpRequest();\n"],
  ])(
    "rejects %s outside adapters",
    (_name, code) => {
      const { status, output } = eslintStdin(GATEWAY, code);
      expect(status).not.toBe(0);
      expect(output).toMatch(/Transport/);
    },
    TIMEOUT,
  );

  it(
    "still allows a test file to stub fetch",
    () => {
      const { status, output } = eslintStdin("packages/core/src/jellyfin/probe.test.ts", 'export const load = fetch("/x");\n');
      expect(output).not.toMatch(/error/);
      expect(status).toBe(0);
    },
    TIMEOUT,
  );
});

// The public method names of JellyfinGateway, read with the compiler (private and protected members skipped).
function publicGatewayMethods(): string[] {
  const file = join(core, "src/jellyfin/gateway.ts");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === "JellyfinGateway") {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) continue;
        const flags = ts.getCombinedModifierFlags(member);
        if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
        names.push(member.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

describe('"every call" is checked, not listed by hand', () => {
  // Methods that send nothing.
  const SENDS_NOTHING = new Set(["confirmUnencryptedConnection", "forgetUnencryptedConnection", "currentUserName", "sessionId", "imageUrl"]);
  const TABLES = [
    "packages/core/src/jellyfin/gateway-transport.test.ts",
    "packages/core/src/jellyfin/gateway-redirect-port.test.ts",
    "packages/core/src/transport-canary.test.ts",
  ];

  it("finds the gateway's public methods", () => {
    const names = publicGatewayMethods();
    expect(names.length).toBeGreaterThan(30);
    expect(names).toContain("userViews");
    expect(names).toContain("createPlaybackPlan");
    expect(names).not.toContain("send");
    expect(names).not.toContain("requireSession");
  });

  it("has no public method that is neither on the allowlist nor a key of each table", () => {
    const methods = publicGatewayMethods().filter((name) => !SENDS_NOTHING.has(name));
    const missing: string[] = [];
    for (const table of TABLES) {
      const text = readFileSync(join(repo, table), "utf8");
      for (const name of methods) {
        if (!new RegExp(`["']${name}["']\\s*:`).test(text)) missing.push(`${table}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("no longer has a method that needs a token or a binary body (authorizationHeader, trickplayTile)", () => {
    const names = publicGatewayMethods();
    expect(names).not.toContain("authorizationHeader");
    expect(names).not.toContain("trickplayTile");
  });
});

describe("the gateway test file for item 1 passes through the package runner", () => {
  it(
    "runs gateway-transport.test.ts green",
    () => {
      const child = spawnSync(
        "pnpm",
        ["--filter", "@octave/core", "--fail-if-no-match", "exec", "vitest", "run", "src/jellyfin/gateway-transport.test.ts"],
        { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
      expect(`${child.stdout}${child.stderr}`).not.toMatch(/FAIL/);
      expect(child.status).toBe(0);
    },
    TIMEOUT,
  );
});

describe("decision 0005 records what T2-04 changes", () => {
  it("has a dated amendment naming the DeviceId, the Quick Connect enabled path and the base URL", () => {
    const text = readFileSync(join(repo, "docs/decisions/0005-token-boundary.md"), "utf8");
    expect(text).toMatch(/amendment[^\n]*20\d\d-\d\d-\d\d/i);
    expect(text).toContain("GET /QuickConnect/Enabled");
    expect(text).toMatch(/DeviceId/);
    expect(text).toMatch(/base URL/i);
  });
});
