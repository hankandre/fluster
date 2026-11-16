// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptRun, planAccept } from "./visual-accept.mjs";

type Status = "expected" | "unexpected" | "flaky" | "skipped";
interface Spec { size: string | null; title: string; status: Status; actual?: boolean; interrupted?: boolean }

// Mirrors the structure of a real Playwright JSON report: file suite > size suite > spec > test > results.
function report(specs: Spec[], extra: { errors?: unknown[]; maxFailures?: number; argv?: string[] } = {}) {
  const sizes = new Map<string, unknown[]>();
  const rootSpecs: unknown[] = [];
  for (const spec of specs) {
    const attachments = spec.actual ? [{ name: `${spec.size}/${spec.title}-actual.png`, path: "/x" }] : [{ name: "error-context", path: "/y" }];
    const final = spec.interrupted ? "interrupted" : spec.status === "unexpected" ? "failed" : "passed";
    const results = spec.status === "flaky" ? [{ status: "failed", retry: 0, attachments }, { status: "passed", retry: 1, attachments: [] }] : [{ status: final, retry: 0, attachments: spec.status === "unexpected" ? attachments : [] }];
    const entry = { title: spec.title, ok: spec.status !== "unexpected", tests: [{ status: spec.status, expectedStatus: "passed", results }] };
    if (spec.size === null) rootSpecs.push(entry);
    else sizes.set(spec.size, [...(sizes.get(spec.size) ?? []), entry]);
  }
  return {
    config: { maxFailures: extra.maxFailures ?? 0, argv: extra.argv ?? ["node", "cli.js", "test", "-c", "playwright.visual.config.ts"] },
    suites: [{ title: "screens.spec.ts", specs: rootSpecs, suites: [...sizes].map(([title, list]) => ({ title, specs: list })) }],
    errors: extra.errors ?? [],
    stats: { unexpected: specs.filter((s) => s.status === "unexpected").length },
  };
}

const ALL = ["1440x900/10-home.png", "1440x900/11-old.png", "1440x900/12-flaky.png", "1440x900/13-changed.png", "1440x900/14-timeout.png"];

describe("planAccept", () => {
  it("copies only the failed capture and leaves passing and flaky ones", () => {
    const results = report([
      { size: "1440x900", title: "10-home", status: "expected" },
      { size: "1440x900", title: "12-flaky", status: "flaky", actual: true },
      { size: "1440x900", title: "13-changed", status: "unexpected", actual: true },
    ]);
    const plan = planAccept({ results, captures: ["1440x900/10-home.png", "1440x900/12-flaky.png", "1440x900/13-changed.png"], baselines: ALL });
    expect(plan).toEqual({ refuse: [], copy: ["1440x900/13-changed.png"], delete: [] });
  });

  it("refuses a failed capture with no actual image, and copies nothing", () => {
    const results = report([
      { size: "1440x900", title: "13-changed", status: "unexpected", actual: true },
      { size: "1440x900", title: "14-timeout", status: "unexpected" },
    ]);
    const plan = planAccept({ results, captures: ["1440x900/13-changed.png"], baselines: ALL });
    expect(plan.refuse).toHaveLength(1);
    expect(plan.refuse[0]).toContain("1440x900/14-timeout.png");
  });

  it("ignores the baselines test when it fails with no actual image", () => {
    const results = report([
      { size: null, title: "baselines match scenarios", status: "unexpected" },
      { size: "1440x900", title: "10-home", status: "expected" },
      { size: "1440x900", title: "13-changed", status: "unexpected", actual: true },
    ]);
    const plan = planAccept({ results, captures: ["1440x900/10-home.png", "1440x900/13-changed.png"], baselines: ["1440x900/10-home.png", "1440x900/13-changed.png"] });
    expect(plan).toEqual({ refuse: [], copy: ["1440x900/13-changed.png"], delete: [] });
  });

  it("deletes a baseline whose scenario is gone, only when the baselines test failed", () => {
    const tests: Spec[] = [{ size: "1440x900", title: "10-home", status: "expected" }];
    const failed = report([{ size: null, title: "baselines match scenarios", status: "unexpected" }, ...tests]);
    const passed = report([{ size: null, title: "baselines match scenarios", status: "expected" }, ...tests]);
    const input = { captures: ["1440x900/10-home.png"], baselines: ["1440x900/10-home.png", "1440x900/11-old.png"] };
    expect(planAccept({ results: failed, ...input }).delete).toEqual(["1440x900/11-old.png"]);
    expect(planAccept({ results: passed, ...input }).delete).toEqual([]);
  });

  it("keeps a baseline whose test is in the report but did not run", () => {
    const results = report([
      { size: null, title: "baselines match scenarios", status: "unexpected" },
      { size: "1440x900", title: "10-home", status: "expected" },
      { size: "1440x900", title: "11-old", status: "skipped" },
    ]);
    const plan = planAccept({ results, captures: ["1440x900/10-home.png"], baselines: ["1440x900/10-home.png", "1440x900/11-old.png"] });
    expect(plan.delete).toEqual([]);
    expect(plan.refuse.length).toBeGreaterThan(0);
  });

  it.each([
    ["top-level errors", { errors: [{ message: "boom" }] }],
    ["the maxFailures limit", { maxFailures: 1 }],
    ["a --grep filter", { argv: ["node", "cli.js", "test", "-g", "10-home"] }],
  ])("refuses an interrupted run: %s", (_name, extra) => {
    const results = report([{ size: "1440x900", title: "13-changed", status: "unexpected", actual: true }], extra);
    const plan = planAccept({ results, captures: ["1440x900/13-changed.png"], baselines: ALL });
    expect(plan.refuse).toHaveLength(1);
  });

  it("refuses a test that was interrupted", () => {
    const results = report([{ size: "1440x900", title: "13-changed", status: "unexpected", actual: true, interrupted: true }]);
    expect(planAccept({ results, captures: ["1440x900/13-changed.png"], baselines: ALL }).refuse.length).toBeGreaterThan(0);
  });
});

describe("acceptRun", () => {
  let root: string;
  let artifact: string;
  let baselines: string;

  function write(dir: string, path: string, content: string): void {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }

  function snapshot(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const size of existsSync(dir) ? readdirSync(dir) : []) {
      for (const file of readdirSync(join(dir, size))) out[`${size}/${file}`] = readFileSync(join(dir, size, file), "utf8");
    }
    return out;
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "visual-accept-"));
    artifact = join(root, "artifact");
    baselines = join(root, "baselines");
    const results = report([
      { size: null, title: "baselines match scenarios", status: "unexpected" },
      { size: "1440x900", title: "10-home", status: "expected" },
      { size: "1440x900", title: "13-changed", status: "unexpected", actual: true },
    ]);
    write(artifact, "results.json", JSON.stringify(results));
    // 10-home passes the gate but its bytes differ from the baseline.
    write(artifact, "1440x900/10-home.png", "new-bytes-10");
    write(artifact, "1440x900/13-changed.png", "new-bytes-13");
    write(baselines, "1440x900/10-home.png", "old-bytes-10");
    write(baselines, "1440x900/13-changed.png", "old-bytes-13");
    write(baselines, "1440x900/11-removed.png", "old-bytes-11");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("copies the failed capture, deletes the removed one, and leaves the passing one alone", () => {
    const plan = acceptRun({ artifactDir: artifact, baselineDir: baselines, dryRun: false });
    expect(plan.refuse).toEqual([]);
    expect(snapshot(baselines)).toEqual({
      "1440x900/10-home.png": "old-bytes-10",
      "1440x900/13-changed.png": "new-bytes-13",
    });
  });

  it("writes nothing on a dry run", () => {
    const before = snapshot(baselines);
    const plan = acceptRun({ artifactDir: artifact, baselineDir: baselines, dryRun: true });
    expect(plan.copy).toEqual(["1440x900/13-changed.png"]);
    expect(plan.delete).toEqual(["1440x900/11-removed.png"]);
    expect(snapshot(baselines)).toEqual(before);
  });

  it("refuses an artifact with no results.json and writes nothing", () => {
    rmSync(join(artifact, "results.json"));
    const before = snapshot(baselines);
    const plan = acceptRun({ artifactDir: artifact, baselineDir: baselines, dryRun: false });
    expect(plan.refuse[0]).toContain("results.json");
    expect(snapshot(baselines)).toEqual(before);
  });
});
