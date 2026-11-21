// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findFrozenProblems, findTaskListProblems, shapeOf, validateManifest } from "./check-flow.mjs";

const MANIFEST = "docs/specs/T9-01.tests.json";
const TEST_FILE = "src/a.test.ts";

const manifest = (extra: Record<string, unknown> = {}) => ({
  task: "T9-01",
  files: [TEST_FILE],
  items: [
    { item: 1, run: ["pnpm", "vitest", "run", TEST_FILE] },
    { item: 2, gate: "owner", why: "a Shield check" },
  ],
  ...extra,
});

describe("validateManifest", () => {
  it("accepts a run and a gate", () => {
    expect(validateManifest(manifest(), "T9-01", 2)).toEqual([]);
  });

  it("refuses the wrong task", () => {
    expect(validateManifest(manifest({ task: "T9-02" }), "T9-01", 2)[0]).toMatch(/^ERROR manifest: .*task/);
  });

  it("refuses an acceptance item left with neither a run nor a gate", () => {
    expect(validateManifest(manifest(), "T9-01", 3).join("\n")).toMatch(/item 3/);
  });

  it("refuses a repeated or extra item", () => {
    const items = [{ item: 1, run: ["node", "x.mjs"] }, { item: 1, run: ["node", "y.mjs"] }];
    expect(validateManifest(manifest({ items }), "T9-01", 1).join("\n")).toMatch(/item 1.*more than once|repeated/);
    expect(validateManifest(manifest(), "T9-01", 1).join("\n")).toMatch(/item 2/);
  });

  it("refuses an entry with both or neither of run and gate", () => {
    const both = { item: 1, run: ["node", "x"], gate: "owner", why: "w" };
    expect(validateManifest(manifest({ items: [both] }), "T9-01", 1).length).toBeGreaterThan(0);
    expect(validateManifest(manifest({ items: [{ item: 1 }] }), "T9-01", 1).length).toBeGreaterThan(0);
  });

  it("refuses a gate kind outside the five and a gate without why", () => {
    expect(validateManifest(manifest({ items: [{ item: 1, gate: "magic", why: "w" }], files: [] }), "T9-01", 1).join("\n")).toMatch(/gate/);
    expect(validateManifest(manifest({ items: [{ item: 1, gate: "met", why: "" }], files: [] }), "T9-01", 1).join("\n")).toMatch(/why/);
    for (const kind of ["owner", "device", "review", "ci", "met"]) {
      expect(validateManifest(manifest({ items: [{ item: 1, gate: kind, why: "w" }], files: [] }), "T9-01", 1)).toEqual([]);
    }
  });

  it("refuses a run whose first word is not node or pnpm", () => {
    const items = [{ item: 1, run: ["bash", "-c", "true"] }];
    expect(validateManifest(manifest({ items }), "T9-01", 1).join("\n")).toMatch(/node or pnpm/);
  });

  it("refuses empty files when an item has a run", () => {
    expect(validateManifest(manifest({ files: [] }), "T9-01", 2).join("\n")).toMatch(/files/);
  });
});

describe("shapeOf", () => {
  const prd = (task: Record<string, unknown>) => ({ rules: ["r"], phases: [{ id: "T9", tasks: [task] }] });
  const base = { id: "T9-01", title: "t", status: "todo", owner: null, passes: false, evidence: "" };

  it("ignores exactly status, owner, passes and evidence", () => {
    const changed = { ...base, status: "done", owner: "x", passes: true, evidence: "commit abcdef1" };
    expect(shapeOf(prd(changed))).toEqual(shapeOf(prd(base)));
  });

  it("sees every other field", () => {
    for (const patch of [{ title: "u" }, { id: "T9-02" }, { human: true }, { acceptance: ["a"] }]) {
      expect(shapeOf(prd({ ...base, ...patch }))).not.toEqual(shapeOf(prd(base)));
    }
    expect(shapeOf({ ...prd(base), rules: ["s"] })).not.toEqual(shapeOf(prd(base)));
  });
});

// Fake history: each commit has the files it holds; a file's blob id is its text.
type Commit = { sha: string; added?: string[]; changed?: string[]; trailers?: string[] };
function history(commits: Commit[], files: Record<string, Record<string, string>>, task?: string) {
  const full = commits.map((c) => ({ sha: c.sha, added: c.added ?? [], changed: [...(c.added ?? []), ...(c.changed ?? [])], trailers: c.trailers ?? [] }));
  return {
    commits: full,
    tip: "tip",
    task,
    read: (rev: string, path: string) => files[rev]?.[path] ?? null,
    blob: (rev: string, path: string) => files[rev]?.[path] ?? null,
    acceptanceCount: () => 2,
  };
}
const M = JSON.stringify(manifest());
const freeze: Commit = { sha: "f1", added: [MANIFEST, TEST_FILE] };
const FROZEN = { [MANIFEST]: M, [TEST_FILE]: "v1" };

describe("findFrozenProblems", () => {
  it("passes an untouched frozen test next to an implementation commit", () => {
    const h = history([freeze, { sha: "i1", added: ["src/a.ts"] }], { f1: FROZEN, i1: { ...FROZEN, "src/a.ts": "x" }, tip: { ...FROZEN, "src/a.ts": "x" } });
    const r = findFrozenProblems(h);
    expect(r.problems).toEqual([]);
    expect(r.manifests).toEqual([{ task: "T9-01", freeze: "f1", files: [TEST_FILE] }]);
    expect(r.frozen).toContainEqual({ path: TEST_FILE, blob: "v1" });
  });

  it("fails an edited frozen test and names the path and the freeze commit", () => {
    const h = history([freeze, { sha: "i1", changed: [TEST_FILE] }], { f1: FROZEN, i1: { ...FROZEN, [TEST_FILE]: "v2" }, tip: { ...FROZEN, [TEST_FILE]: "v2" } });
    const r = findFrozenProblems(h);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/^ERROR frozen test: src\/a\.test\.ts differs from the test writer's version \(f1\)/);
  });

  it("fails a deleted frozen test and a rename away", () => {
    const gone = { [MANIFEST]: M };
    expect(findFrozenProblems(history([freeze, { sha: "i1", changed: [TEST_FILE] }], { f1: FROZEN, tip: gone })).problems).toHaveLength(1);
    const renamed = { ...gone, "src/b.test.ts": "v1" };
    expect(findFrozenProblems(history([freeze, { sha: "i1", changed: [TEST_FILE, "src/b.test.ts"] }], { f1: FROZEN, tip: renamed })).problems).toHaveLength(1);
  });

  it("passes an edit that a later commit reverts", () => {
    const h = history([freeze, { sha: "i1", changed: [TEST_FILE] }, { sha: "i2", changed: [TEST_FILE] }], { f1: FROZEN, tip: FROZEN });
    expect(findFrozenProblems(h).problems).toEqual([]);
  });

  it("passes a trailered change and lists it", () => {
    const edited = { ...FROZEN, [TEST_FILE]: "v2" };
    const h = history([freeze, { sha: "po", changed: [TEST_FILE], trailers: [`Frozen-Test-Change: ${TEST_FILE} -- wrong expectation`] }], { f1: FROZEN, po: edited, tip: edited });
    const r = findFrozenProblems(h);
    expect(r.problems).toEqual([]);
    expect(r.changes).toEqual([{ path: TEST_FILE, commit: "po", reason: "wrong expectation" }]);
    expect(r.frozen).toContainEqual({ path: TEST_FILE, blob: "v2" });
  });

  it("fails an implementer edit after a Product Owner change", () => {
    const po = { ...FROZEN, [TEST_FILE]: "v2" };
    const h = history(
      [freeze, { sha: "po", changed: [TEST_FILE], trailers: [`Frozen-Test-Change: ${TEST_FILE} -- why`] }, { sha: "i1", changed: [TEST_FILE] }],
      { f1: FROZEN, po, tip: { ...FROZEN, [TEST_FILE]: "v3" } },
    );
    expect(findFrozenProblems(h).problems).toHaveLength(1);
  });

  it("fails a manifest edited without a trailer, and accepts one with a trailer", () => {
    const m2 = JSON.stringify(manifest({ files: [TEST_FILE, "src/b.test.ts"] }));
    const bad = history([freeze, { sha: "i1", changed: [MANIFEST] }], { f1: FROZEN, tip: { ...FROZEN, [MANIFEST]: m2 } });
    expect(findFrozenProblems(bad).problems.join("\n")).toMatch(/docs\/specs\/T9-01\.tests\.json differs/);
    const ok = history(
      [freeze, { sha: "po", changed: [MANIFEST], added: ["src/b.test.ts"], trailers: [`Frozen-Test-Change: ${MANIFEST} -- add a file`, "Frozen-Test-Change: src/b.test.ts -- new"] }],
      { f1: FROZEN, po: { ...FROZEN, [MANIFEST]: m2, "src/b.test.ts": "n" }, tip: { ...FROZEN, [MANIFEST]: m2, "src/b.test.ts": "n" } },
    );
    const r = findFrozenProblems(ok);
    expect(r.problems).toEqual([]);
    expect(r.manifests[0].files).toEqual([TEST_FILE, "src/b.test.ts"]);
  });

  it("finds a manifest even when a later commit deleted it, and reports the deletion", () => {
    const h = history([freeze, { sha: "i1", changed: [MANIFEST] }], { f1: FROZEN, tip: { [TEST_FILE]: "v1" } });
    expect(findFrozenProblems(h).problems.join("\n")).toMatch(/tests\.json differs/);
  });

  it("refuses an invalid manifest at the freeze commit", () => {
    const h = history([freeze], { f1: { ...FROZEN, [MANIFEST]: JSON.stringify(manifest({ task: "T9-02" })) }, tip: FROZEN });
    expect(findFrozenProblems(h).problems.join("\n")).toMatch(/^ERROR manifest:/m);
  });

  it("passes a branch with no manifest, and fails one when a task is required", () => {
    expect(findFrozenProblems(history([{ sha: "i1", added: ["a.ts"] }], { tip: {} })).problems).toEqual([]);
    const r = findFrozenProblems(history([{ sha: "i1", added: ["a.ts"] }], { tip: {} }, "T9-01"));
    expect(r.missingManifest).toBe(true);
    expect(r.problems.join("\n")).toMatch(/no manifest/);
  });

  it("refuses two manifests in one range that freeze the same path", () => {
    const m2 = { ...FROZEN, "docs/specs/T9-02.tests.json": JSON.stringify(manifest({ task: "T9-02" })) };
    const h = history([freeze, { sha: "f2", added: ["docs/specs/T9-02.tests.json"] }], { f1: FROZEN, f2: m2, tip: m2 });
    expect(findFrozenProblems(h).problems.join("\n")).toMatch(/frozen by two manifests/);
  });

  it("reports a manifest changed but not added in the range as not frozen, with a task required", () => {
    const h = history([{ sha: "c1", changed: [MANIFEST] }], { tip: FROZEN }, "T9-01");
    const r = findFrozenProblems(h);
    expect(r.missingManifest).toBe(true);
    expect(r.problems.join("\n")).toMatch(/already exists on the base/);
  });
});

describe("findTaskListProblems", () => {
  const PRD = "tasks/prd.json";
  const LOG = "tasks/product-owner-log.md";
  const shapes: Record<string, string> = { base: "A", tip: "A", po: "B" };
  const run = (commits: Commit[], shape: Record<string, string>) =>
    findTaskListProblems({ commits: commits.map((c) => ({ sha: c.sha, added: [], changed: c.changed ?? [], trailers: c.trailers ?? [] })), base: "base", tip: "tip", shapeAt: (rev: string) => shape[rev] });

  it("passes a status-only change", () => {
    expect(run([{ sha: "c", changed: [PRD] }], shapes).problems).toEqual([]);
  });

  it("fails a changed shape without the trailer", () => {
    const r = run([{ sha: "c", changed: [PRD] }], { ...shapes, tip: "B" });
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/^ERROR task list: tasks\/prd\.json changed outside status, owner, passes and evidence/);
  });

  it("fails the trailer without a log change, and passes with both", () => {
    const trailers = ["Product-Owner-Pass: 2026-11-20"];
    expect(run([{ sha: "po", changed: [PRD], trailers }], { ...shapes, tip: "B" }).problems).toHaveLength(1);
    const r = run([{ sha: "po", changed: [PRD, LOG], trailers }], { ...shapes, tip: "B" });
    expect(r.problems).toEqual([]);
    expect(r.changed).toBe(true);
  });

  it("fails a later commit that changes the list again", () => {
    const trailers = ["Product-Owner-Pass: 2026-11-20"];
    const r = run([{ sha: "po", changed: [PRD, LOG], trailers }, { sha: "c", changed: [PRD] }], { ...shapes, tip: "C" });
    expect(r.problems).toHaveLength(1);
  });
});
