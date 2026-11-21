// @vitest-environment node
// T2-02 acceptance items 1 and 2: the core lives in the @octave/core workspace package, and its tests run in Node.
import { existsSync, globSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = join(root, "packages", "core");
const coreSrc = join(core, "src");

type Manifest = {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

function readJson(path: string): Manifest | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function coreFiles(): string[] {
  if (!existsSync(coreSrc)) return [];
  return readdirSync(coreSrc, { recursive: true })
    .map((entry) => String(entry).split("\\").join("/"))
    .filter((path) => path.endsWith(".ts"))
    .sort();
}

const isTest = (path: string) => path.endsWith(".test.ts");

// The workspace file has no YAML parser among the dependencies, so read the packages list by hand.
function workspacePackages(): string[] {
  const path = join(root, "pnpm-workspace.yaml");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n");
  // Flow style: packages: ["packages/*"]
  const flow = lines.map((line) => /^packages:\s*\[([^\]]*)\]/.exec(line)).find(Boolean);
  if (flow) return flow[1].split(",").map((entry) => entry.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  // Block style: packages:\n  - packages/*
  const start = lines.findIndex((line) => /^packages:\s*(#.*)?$/.test(line));
  if (start === -1) return [];
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[^\s#-]/.test(line)) break;
    const match = /^\s*-\s+["']?([^"'\s#]+)["']?/.exec(line);
    if (match) entries.push(match[1]);
  }
  return entries;
}

describe("core package layout", () => {
  it("makes the repository a pnpm workspace that lists packages/core", () => {
    const packages = workspacePackages();
    expect(packages.some((entry) => entry === "packages/*" || entry === "packages/core")).toBe(true);
  });

  it("names the package @octave/core, private, with a test script", () => {
    const manifest = readJson(join(core, "package.json"));
    expect(manifest).not.toBeNull();
    expect(manifest?.name).toBe("@octave/core");
    expect(manifest?.private).toBe(true);
    expect(typeof manifest?.scripts?.test).toBe("string");
  });

  it("drops the Jellyfin SDK and axios from the root manifest", () => {
    const manifest = readJson(join(root, "package.json"));
    expect(manifest).not.toBeNull();
    for (const name of ["@jellyfin/sdk", "axios"]) {
      expect(manifest?.dependencies?.[name]).toBeUndefined();
      expect(manifest?.devDependencies?.[name]).toBeUndefined();
    }
  });

  it("holds the domain, gateway and negotiation, coordinator, playstate reporter, redaction and safe reasons", () => {
    const sources = [
      "domain/playback.ts",
      "domain/conversion-copy.ts",
      "domain/host-class.ts",
      "jellyfin/gateway.ts",
      "jellyfin/source-acceptance.ts",
      "jellyfin/hls-url.ts",
      "jellyfin/device-profile.ts",
      "player/coordinator.ts",
      "player/playstate-reporter.ts",
      "player/session-state.ts",
      "redact.ts",
      "safe-reason.ts",
      "transport-error.ts",
    ];
    const missing = sources.filter((path) => !existsSync(join(coreSrc, path)));
    expect(missing).toEqual([]);
  });

  it("holds the core tests beside their modules", () => {
    const tests = [
      "jellyfin/gateway.test.ts",
      "jellyfin/conversion-negotiation.test.ts",
      "player/coordinator.test.ts",
      "player/playstate-reporter.test.ts",
      "redact-canary.test.ts",
      "safe-reason.test.ts",
      "domain/playback.test.ts",
    ];
    const missing = tests.filter((path) => !existsSync(join(coreSrc, path)));
    expect(missing).toEqual([]);
  });

  it("moves every core source and test file, none dropped", () => {
    const files = coreFiles();
    // origin/main before the move: 43 sources and 54 tests under src/domain and src/lib.
    expect(files.filter((path) => !isTest(path)).length).toBeGreaterThanOrEqual(43);
    expect(files.filter(isTest).length).toBeGreaterThanOrEqual(54);
  });

  it("holds the shared fixtures and vectors", () => {
    const fixtures = join(core, "tests", "fixtures");
    for (const file of ["hls-playlists.json", "hls-master-urls.json", "host-classes.json"]) {
      expect(existsSync(join(fixtures, file)), file).toBe(true);
    }
    for (const folder of ["jellyfin/10.11.7", "jellyfin/12.4.0"]) {
      const path = join(fixtures, folder);
      expect(existsSync(path) && statSync(path).isDirectory(), folder).toBe(true);
      expect(readdirSync(path).length, folder).toBeGreaterThan(0);
    }
  });

  it("leaves no core code or fixtures at the old root paths", () => {
    for (const path of ["src/domain", "src/lib", "tests/fixtures"]) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
  });
});

describe("core tests run in Node", () => {
  it("sets the package's Vitest environment to node", () => {
    const path = join(core, "vitest.config.ts");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toMatch(/environment:\s*["']node["']/);
  });

  it("asks no core test for a DOM environment", () => {
    const tests = coreFiles().filter(isTest);
    expect(tests.length).toBeGreaterThanOrEqual(54);
    const offenders = tests.filter((path) => {
      const text = readFileSync(join(coreSrc, path), "utf8");
      return [...text.matchAll(/@vitest-environment\s+(\S+)/g)].some((match) => match[1] !== "node");
    });
    expect(offenders).toEqual([]);
  });

  it("depends on no DOM emulation or view testing library", () => {
    const manifest = readJson(join(core, "package.json"));
    expect(manifest).not.toBeNull();
    const names = Object.keys({
      ...manifest?.dependencies,
      ...manifest?.devDependencies,
      ...manifest?.peerDependencies,
      ...manifest?.optionalDependencies,
    });
    expect(names.filter((name) => name === "jsdom" || name === "happy-dom" || name.startsWith("@testing-library/"))).toEqual([]);
  });

  it("points every fixture glob and __dirname path in a core test at existing files", () => {
    const tests = coreFiles().filter(isTest);
    expect(tests.length).toBeGreaterThanOrEqual(54);
    let globs = 0;
    let joins = 0;
    const broken: string[] = [];
    for (const path of tests) {
      const file = join(coreSrc, path);
      const here = dirname(file);
      const text = readFileSync(file, "utf8");
      // A wrong import.meta.glob path yields {} and the tests pass on nothing.
      for (const match of text.matchAll(/import\.meta\.glob(?:<[^>]*>)?\(\s*(["'`])([^"'`]+)\1/g)) {
        globs += 1;
        if (globSync(match[2], { cwd: here }).length === 0) broken.push(`${path}: import.meta.glob("${match[2]}") matches nothing`);
      }
      for (const match of text.matchAll(/join\(\s*__dirname\s*,\s*(["'`])([^"'`]+)\1\s*\)/g)) {
        joins += 1;
        if (!existsSync(resolve(here, match[2]))) broken.push(`${path}: join(__dirname, "${match[2]}") does not exist`);
      }
    }
    // origin/main before the move: 7 import.meta.glob calls and 13 join(__dirname, ...) paths in the core tests.
    expect(globs).toBeGreaterThanOrEqual(7);
    expect(joins).toBeGreaterThanOrEqual(13);
    expect(broken).toEqual([]);
  });
});
