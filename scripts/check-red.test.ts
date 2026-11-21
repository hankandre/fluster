// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { compareGates, parseSpecGates } from "./check-red.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check-red.mjs");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });

const PASS = ["node", "-e", "process.exit(0)"];
const FAIL = ["node", "-e", "process.exit(1)"];

type Item = Record<string, unknown>;
function setup(items: Item[], spec = "# spec\n\n## Acceptance\n\n| # | item | tested |\n|---|---|---|\n| 1 | a | b |\n| 2 | c | d |\n", extra: Record<string, unknown> = {}, acceptance = ["a", "c"], freezeExtra: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "check-red-"));
  dirs.push(dir);
  mkdirSync(join(dir, "docs", "specs"), { recursive: true });
  mkdirSync(join(dir, "tasks"), { recursive: true });
  writeFileSync(join(dir, "docs", "specs", "T9-01.md"), spec);
  writeFileSync(join(dir, "tasks", "prd.json"), JSON.stringify({ phases: [{ id: "T9", tasks: [{ id: "T9-01", acceptance }] }] }));
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "spec");
  const manifest = { task: "T9-01", files: ["a.test.ts"], items, ...extra };
  writeFileSync(join(dir, "docs", "specs", "T9-01.tests.json"), JSON.stringify(manifest));
  writeFileSync(join(dir, "a.test.ts"), "// test\n");
  for (const path of freezeExtra) writeFileSync(join(dir, path), "// extra\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "freeze");
  return dir;
}
const run = (dir: string, ...extra: string[]) => {
  const out = spawnSync(process.execPath, [SCRIPT, "T9-01", "--repo", dir, ...extra], { encoding: "utf8" });
  const line = out.stdout.trim().split("\n").pop() ?? "";
  return { status: out.status, json: line ? JSON.parse(line) : null, stderr: out.stderr };
};

describe("check-red", () => {
  it("exits 0 when every run is red, and returns the blob ids of the frozen files", () => {
    const dir = setup([{ item: 1, run: FAIL }, { item: 2, run: FAIL }]);
    const r = run(dir);
    expect(r.status).toBe(0);
    expect(r.json.red).toEqual([1, 2]);
    expect(r.json.green).toEqual([]);
    expect(Object.keys(r.json.blobs).sort()).toEqual(["a.test.ts", "docs/specs/T9-01.tests.json"]);
    expect(r.json.blobs["a.test.ts"]).toBe(git(dir, "rev-parse", "HEAD:a.test.ts").trim());
  });

  it("exits 1 and lists the green item when a command passes", () => {
    const r = run(setup([{ item: 1, run: PASS }, { item: 2, run: FAIL }]));
    expect(r.status).toBe(1);
    expect(r.json.green).toEqual([1]);
    expect(r.json.red).toEqual([2]);
  });

  it("exits 0 for gates only and lists them", () => {
    const spec = "## Acceptance\n\n| 1 | a | gate: owner |\n| 2 | c | gate: device |\n";
    const r = run(setup([{ item: 1, gate: "owner", why: "x" }, { item: 2, gate: "device", why: "y" }], spec));
    expect(r.status).toBe(0);
    expect(r.json.gates).toEqual([{ item: 1, kind: "owner", why: "x" }, { item: 2, kind: "device", why: "y" }]);
  });

  it("exits 2 for a gate the spec does not name, and for a spec gate the manifest runs", () => {
    const unnamed = run(setup([{ item: 1, run: FAIL }, { item: 2, gate: "review", why: "x" }]));
    expect(unnamed.status).toBe(2);
    expect(unnamed.json.problems.join("\n")).toMatch(/item 2.*review.*spec does not name/);
    const spec = "## Acceptance\n\n| 1 | a | b |\n| 2 | c | gate: ci |\n";
    const ran = run(setup([{ item: 1, run: FAIL }, { item: 2, run: FAIL }], spec));
    expect(ran.status).toBe(2);
    expect(ran.json.problems.join("\n")).toMatch(/item 2.*gate: ci/);
  });

  it("exits 2 for an invalid manifest, a command that cannot start, and a first word other than node or pnpm", () => {
    expect(run(setup([{ item: 1, run: FAIL }])).status).toBe(2);
    const missing = run(setup([{ item: 1, run: ["node", "/no/such/file.mjs"] }, { item: 2, run: ["pnpm-not-here"] }]));
    expect(missing.status).toBe(2);
    const bash = run(setup([{ item: 1, run: ["bash", "-c", "exit 1"] }, { item: 2, run: FAIL }]));
    expect(bash.status).toBe(2);
    expect(bash.json.problems.join("\n")).toMatch(/node or pnpm/);
  });

  it("--expect green exits 0 when every run passes, 1 when one is still red", () => {
    expect(run(setup([{ item: 1, run: PASS }, { item: 2, run: PASS }]), "--expect", "green").status).toBe(0);
    const r = run(setup([{ item: 1, run: PASS }, { item: 2, run: FAIL }]), "--expect", "green");
    expect(r.status).toBe(1);
    expect(r.json.red).toEqual([2]);
  });

  it("exits 2 when the spec table and the task's acceptance array disagree on the count", () => {
    const spec = "## Acceptance\n\n| 1 | a | b |\n| 2 | c | d |\n| 3 | e | f |\n";
    const r = run(setup([{ item: 1, run: FAIL }, { item: 2, run: FAIL }, { item: 3, run: FAIL }], spec));
    expect(r.status).toBe(2);
    expect(r.json.problems.join("\n")).toMatch(/3 Acceptance rows but tasks\/prd.json has 2/);
  });

  it("exits 2 when the freeze commit changed a file the manifest does not list", () => {
    const r = run(setup([{ item: 1, run: FAIL }, { item: 2, run: FAIL }], undefined, {}, ["a", "c"], ["src-foo.test.ts"]));
    expect(r.status).toBe(2);
    expect(r.json.problems.join("\n")).toMatch(/src-foo\.test\.ts.*not in the manifest's files/);
  });

  it("refuses an unknown --expect", () => {
    expect(run(setup([{ item: 1, run: PASS }, { item: 2, run: PASS }]), "--expect", "blue").status).toBe(2);
  });
});

describe("parseSpecGates and compareGates", () => {
  it("reads gate kinds from the Acceptance table only", () => {
    const spec = "## Goal\n\n| 9 | x | gate: owner |\n\n## Acceptance\n\n| # | a | b |\n| 1 | a | gate: review |\n| 2 | b | tested |\n\n## Files\n\n| 3 | c | gate: ci |\n";
    expect(parseSpecGates(spec)).toEqual({ 1: "review" });
  });

  it("matches manifest gates against the spec", () => {
    const manifest = { items: [{ item: 1, gate: "met", why: "w" }, { item: 2, run: FAIL }] };
    expect(compareGates(manifest, { 1: "met" })).toEqual([]);
    expect(compareGates(manifest, {}).length).toBe(1);
    expect(compareGates(manifest, { 1: "met", 2: "ci" }).length).toBe(1);
    expect(compareGates(manifest, { 1: "owner" }).length).toBe(1);
  });
});
