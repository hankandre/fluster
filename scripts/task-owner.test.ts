// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { applyOps } from "./task-owner.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "task-owner.mjs");
const mk = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Task ${id}`, domain: "Process", model: "sonnet", skill: "exec-plan", human: false, depends_on: [], acceptance: ["one"], verify: "pnpm check",
  status: "todo", owner: null, passes: false, evidence: "", ...extra,
});
const prd = (phases: Record<string, unknown>[] = [{ id: "T9", name: "n", goal: "g", exit: "e", tasks: [mk("T9-01"), mk("T9-02", { status: "done", passes: true, evidence: "PR #1" }), mk("T9-03", { depends_on: ["T9-02"] })] }]) =>
  JSON.stringify({ product: "p", updated: "2026-01-01", rules: ["r1"], status_values: ["todo", "in_progress", "blocked", "done"], phases }, null, 2) + "\n";
const backlogLine = (what: string, extra = "") => `{"what": "${what}", "why": "w", "source": "s", "size": "S", "date": "2026-11-20"${extra}}`;
const backlog = (...lines: string[]) => lines.join("\n") + "\n";
const NEW = { id: "T9-04", title: "New", domain: "Process", model: "opus", skill: "exec-plan", human: false, depends_on: ["T9-01"], acceptance: ["a"], verify: "pnpm check" };
const files = () => ({ prd: prd(), backlog: backlog(backlogLine("Alpha"), backlogLine("Beta", ', "taken_by": "T9-02"')) });
const opts = { date: "2026-11-21", readApproval: (path: string) => (path === "docs/specs/decisions-t9.md" ? "T9-03 acceptance is settled" : null) };
const tasks = (text: string) => (JSON.parse(text).phases as { tasks: { id: string }[] }[]).flatMap((p) => p.tasks.map((t) => t.id));

describe("applyOps", () => {
  it("add writes the keys in file order with the todo defaults, sets taken_by, and sets updated", () => {
    const out = applyOps(files(), [{ op: "add", phase: "T9", after: "T9-03", task: NEW, takes: ["Alpha"] }], opts);
    const added = JSON.parse(out.prd).phases[0].tasks[3];
    expect(Object.keys(added)).toEqual(["id", "title", "domain", "model", "skill", "human", "depends_on", "acceptance", "verify", "status", "owner", "passes", "evidence"]);
    expect([added.status, added.owner, added.passes, added.evidence]).toEqual(["todo", null, false, ""]);
    expect(JSON.parse(out.prd).updated).toBe("2026-11-21");
    expect(out.prd).toBe(JSON.stringify(JSON.parse(out.prd), null, 2) + "\n");
    expect(out.backlog.split("\n")[0]).toBe(backlogLine("Alpha", ', "taken_by": "T9-04"'));
    expect(out.backlog.split("\n")[1]).toBe(backlogLine("Beta", ', "taken_by": "T9-02"'));
  });

  it("add is refused without takes, with an unknown what, with a taken entry, a used id or a wrong phase", () => {
    const add = (extra: Record<string, unknown>, task = NEW) => () => applyOps(files(), [{ op: "add", phase: "T9", after: "T9-03", task, takes: ["Alpha"], ...extra }], opts);
    expect(add({ takes: [] })).toThrow(/takes/);
    expect(add({ takes: undefined })).toThrow(/takes/);
    expect(add({ takes: ["Nope"] })).toThrow(/Nope/);
    expect(add({ takes: ["Beta"] })).toThrow(/Beta.*taken/);
    expect(add({}, { ...NEW, id: "T9-01" })).toThrow(/T9-01/);
    expect(add({}, { ...NEW, id: "T8-04" })).toThrow(/phase/);
    expect(add({}, { ...NEW, depends_on: ["T9-99"] })).toThrow(/T9-99/);
    expect(add({}, { ...NEW, status: "done" } as typeof NEW)).toThrow(/status/);
  });

  it("drop refuses a done task and a depended-on task, and drops a todo one", () => {
    expect(() => applyOps(files(), [{ op: "drop", id: "T9-02", why: "x" }], opts)).toThrow(/done|in_progress/);
    expect(() => applyOps(files(), [{ op: "drop", id: "T9-01", why: "x" }, { op: "drop", id: "T9-03", why: "x" }], opts)).not.toThrow();
    const f = { ...files(), prd: prd([{ id: "T9", name: "n", goal: "g", exit: "e", tasks: [mk("T9-01"), mk("T9-03", { depends_on: ["T9-01"] })] }]) };
    expect(() => applyOps(f, [{ op: "drop", id: "T9-01", why: "x" }], opts)).toThrow(/T9-03.*depends/);
    expect(tasks(applyOps(files(), [{ op: "drop", id: "T9-03", why: "x" }], opts).prd)).toEqual(["T9-01", "T9-02"]);
  });

  it("an id dropped in the same operations cannot be added again", () => {
    const again = { ...NEW, id: "T9-03", depends_on: ["T9-01"], acceptance: ["REWRITTEN without owner approval"] };
    const ops = [{ op: "drop", id: "T9-03", why: "x" }, { op: "add", phase: "T9", after: "T9-01", task: again, takes: ["Alpha"] }];
    expect(() => applyOps(files(), ops, opts)).toThrow(/T9-03.*dropped/);
  });

  it("move reorders", () => {
    const out = applyOps(files(), [{ op: "move", id: "T9-03", phase: "T9", before: "T9-01" }], opts);
    expect(tasks(out.prd)).toEqual(["T9-03", "T9-01", "T9-02"]);
  });

  it("edit changes the allowed fields", () => {
    const out = applyOps(files(), [{ op: "edit", id: "T9-01", fields: { title: "Renamed", model: "fable" } }], opts);
    expect(JSON.parse(out.prd).phases[0].tasks[0]).toMatchObject({ title: "Renamed", model: "fable" });
  });

  it("edit of acceptance, human or verify needs an owner approval file that names the task", () => {
    for (const fields of [{ acceptance: ["two"] }, { human: true }, { verify: "pnpm test" }]) {
      const edit = (approval?: string) => () => applyOps(files(), [{ op: "edit", id: "T9-03", fields, owner_approval: approval }], opts);
      expect(edit()).toThrow(/owner_approval/);
      expect(edit("docs/specs/decisions-none.md")).toThrow(/owner_approval/);
      expect(edit("README.md")).toThrow(/owner_approval/);
      expect(edit("docs/specs/decisions-t9.md")).not.toThrow();
    }
    const wrongTask = () => applyOps(files(), [{ op: "edit", id: "T9-01", fields: { acceptance: ["two"] }, owner_approval: "docs/specs/decisions-t9.md" }], opts);
    expect(wrongTask).toThrow(/T9-01/);
  });

  it("a scope edit changes acceptance without an approval file and logs its reason", () => {
    const out = applyOps(files(), [{ op: "edit", id: "T9-01", fields: { acceptance: ["moved path"] }, scope: "the fixtures moved" }], opts);
    expect(JSON.parse(out.prd).phases[0].tasks[0].acceptance).toEqual(["moved path"]);
    expect(out.summary.join("\n")).toMatch(/scope: T9-01 acceptance .*owner can veto.*the fixtures moved/);
  });

  it("a scope edit is refused for human or verify, and without a reason", () => {
    const scope = (fields: Record<string, unknown>, reason: unknown = "why") => () => applyOps(files(), [{ op: "edit", id: "T9-01", fields, scope: reason }], opts);
    expect(scope({ human: true })).toThrow(/owner_approval/);
    expect(scope({ verify: "pnpm test" })).toThrow(/owner_approval/);
    expect(scope({ acceptance: ["two"], verify: "pnpm test" })).toThrow(/owner_approval/);
    expect(scope({ acceptance: ["two"] }, "")).toThrow(/scope/);
    expect(scope({ acceptance: ["two"] }, 3)).toThrow(/scope/);
  });

  it("an owner_approval wins over scope and is still checked", () => {
    const op = { op: "edit", id: "T9-01", fields: { acceptance: ["two"] }, scope: "why", owner_approval: "docs/specs/decisions-t9.md" };
    expect(() => applyOps(files(), [op], opts)).toThrow(/does not name T9-01/);
  });

  it("returns each approval path in the summary", () => {
    const out = applyOps(files(), [{ op: "edit", id: "T9-03", fields: { acceptance: ["two"] }, owner_approval: "docs/specs/decisions-t9.md" }], opts);
    expect(out.summary.join("\n")).toContain("docs/specs/decisions-t9.md");
  });

  it("refuses the four status fields, id, depends_on-free unknown fields, and rules", () => {
    for (const field of ["status", "owner", "passes", "evidence", "id", "bogus"]) {
      expect(() => applyOps(files(), [{ op: "edit", id: "T9-01", fields: { [field]: "x" } }], opts)).toThrow(field === "bogus" ? /bogus/ : /pnpm task set|id/);
    }
    expect(() => applyOps(files(), [{ op: "rule", index: 0, text: "x" }], opts)).toThrow(/unknown operation/);
  });

  it("a failed operation leaves the inputs unchanged", () => {
    const f = files();
    expect(() => applyOps(f, [{ op: "move", id: "T9-03", phase: "T9", before: "T9-01" }, { op: "drop", id: "T9-02", why: "x" }], opts)).toThrow();
    expect(f).toEqual(files());
  });
});

describe("the command line", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("applies an ops file under --root and leaves both files unchanged on failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "task-owner-"));
    dirs.push(dir);
    mkdirSync(join(dir, "tasks"));
    const f = files();
    writeFileSync(join(dir, "tasks", "prd.json"), f.prd);
    writeFileSync(join(dir, "tasks", "backlog.jsonl"), f.backlog);
    const call = (ops: unknown) => {
      writeFileSync(join(dir, "ops.json"), JSON.stringify(ops));
      return spawnSync(process.execPath, [SCRIPT, "apply", join(dir, "ops.json"), "--date", "2026-11-21", "--root", dir], { encoding: "utf8" });
    };
    const bad = call([{ op: "drop", id: "T9-02", why: "x" }]);
    expect(bad.status).toBe(1);
    expect(readFileSync(join(dir, "tasks", "prd.json"), "utf8")).toBe(f.prd);
    const good = call([{ op: "add", phase: "T9", after: "T9-03", task: NEW, takes: ["Alpha"] }]);
    expect(good.status).toBe(0);
    expect(tasks(readFileSync(join(dir, "tasks", "prd.json"), "utf8"))).toContain("T9-04");
    expect(readFileSync(join(dir, "tasks", "backlog.jsonl"), "utf8")).toContain('"taken_by": "T9-04"');
  });
});
