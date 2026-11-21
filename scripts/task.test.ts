// @vitest-environment node
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_REFERENCE,
  MAX_EVIDENCE_CHARS,
  MAX_FILE_BYTES,
  TASK_FILE,
  applySet,
  checkTaskFile,
  findTask,
  listLines,
  nextTask,
  parseListArgs,
  parseSetArgs,
  type Prd,
} from "./task.mjs";

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Title of ${id}`,
  status: "todo",
  owner: null,
  passes: false,
  evidence: null,
  human: false,
  depends_on: [] as string[],
  acceptance: [`ACCEPT-${id}`],
  ...extra,
});

const fixture = {
  rules: ["a rule"],
  status_values: ["todo", "in_progress", "blocked", "done"],
  phases: [
    {
      id: "P1",
      name: "One",
      tasks: [
        task("A-01", { status: "done", passes: true, evidence: "EVIDENCE-A-01 PR #1" }),
        task("A-02", { human: true }),
        task("A-03", { depends_on: ["B-01"] }),
        task("A-04", { depends_on: ["A-01"] }),
        task("A-05", { status: "in_progress", owner: "someone" }),
        task("A-06", { status: "blocked", evidence: "EVIDENCE-A-06 waiting" }),
      ],
    },
    {
      id: "P2",
      name: "Two",
      tasks: [task("B-01", { status: "done", passes: true, evidence: "EVIDENCE-B-01 commit ccac1f5" }), task("B-02", { depends_on: ["Z-99"] })],
    },
  ],
};
const canonical = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const clone = () => JSON.parse(JSON.stringify(fixture)) as Prd;
const text = canonical(fixture);
const throwsMessage = (fn: () => unknown, part: string) => expect(fn).toThrow(part);

describe("nextTask", () => {
  it("returns the first ready task in file order with its phase", () => {
    const next = nextTask(clone());
    expect(next?.id).toBe("A-03");
    expect(next?.phase).toBe("P1");
  });

  it("counts a dependency later in the file when it passes", () => {
    expect(nextTask(clone())?.id).toBe("A-03");
  });

  it("skips a todo whose dependency is not done", () => {
    const prd = clone();
    prd.phases[1].tasks[0].status = "todo";
    prd.phases[1].tasks[0].passes = false;
    expect(nextTask(prd)?.id).toBe("A-04");
  });

  it("skips human, in_progress, blocked and done tasks", () => {
    const prd = clone();
    prd.phases[0].tasks = prd.phases[0].tasks.filter((t) => ["A-01", "A-02", "A-05", "A-06"].includes(t.id));
    expect(nextTask(prd)).toBeNull();
  });

  it("treats an unknown dependency as blocking", () => {
    const prd = clone();
    prd.phases[0].tasks = [];
    expect(nextTask(prd)).toBeNull();
  });

  it("returns exactly one task", () => {
    expect(JSON.stringify(nextTask(clone()))).not.toContain("ACCEPT-A-04");
  });
});

describe("findTask", () => {
  it("returns the one task with its phase", () => {
    const hit = findTask(clone(), "B-02");
    expect(hit.phase).toBe("P2");
    expect(hit.id).toBe("B-02");
  });

  it("throws on an unknown id", () => {
    throwsMessage(() => findTask(clone(), "Q-1"), "ERROR task: no task Q-1");
  });
});

describe("listLines", () => {
  it("prints one id, status, title line per task", () => {
    const lines = listLines(clone());
    expect(lines).toHaveLength(8);
    expect(lines[0]?.split("\t")).toEqual(["A-01", "done", "Title of A-01"]);
    expect(lines.every((line) => line.split("\t").length === 3)).toBe(true);
  });

  it("filters by status, by phase and by both", () => {
    expect(listLines(clone(), { status: "done" })).toHaveLength(2);
    expect(listLines(clone(), { phase: "P2" })).toHaveLength(2);
    expect(listLines(clone(), { status: "done", phase: "P2" })).toHaveLength(1);
  });

  it("fails on an unknown status or phase", () => {
    throwsMessage(() => listLines(clone(), { status: "nope" }), "unknown status");
    throwsMessage(() => listLines(clone(), { phase: "P9" }), "unknown phase");
  });

  it("leaks no acceptance or evidence", () => {
    const out = listLines(clone()).join("\n");
    expect(out).not.toContain("ACCEPT-");
    expect(out).not.toContain("EVIDENCE-");
  });
});

describe("parseListArgs", () => {
  it("reads both flag forms", () => {
    expect(parseListArgs(["--status=todo", "--phase", "P1"])).toEqual({ status: "todo", phase: "P1" });
    expect(parseListArgs([])).toEqual({ status: undefined, phase: undefined });
  });

  it("refuses unknown flags and positionals", () => {
    throwsMessage(() => parseListArgs(["--phaes", "T1"]), "list takes only");
    throwsMessage(() => parseListArgs(["todo"]), "list takes only");
  });
});

describe("parseSetArgs", () => {
  it("parses the id and the three allowed options", () => {
    expect(parseSetArgs(["T1-13", "--status", "done", "--owner", "me", "--evidence-file", "/x"])).toEqual({
      id: "T1-13",
      status: "done",
      owner: "me",
      evidenceFile: "/x",
    });
  });

  it.each(["--title", "--passes", "--acceptance", "--depends_on", "--verify"])("refuses %s with the fixed message", (flag) => {
    throwsMessage(
      () => parseSetArgs(["T1-13", "--status", "done", flag, "x"]),
      "ERROR task: set changes only status, owner, passes and evidence",
    );
  });

  it("requires --status and one id", () => {
    throwsMessage(() => parseSetArgs(["T1-13"]), "requires --status");
    throwsMessage(() => parseSetArgs(["--status", "done"]), "exactly one task id");
  });
});

describe("applySet", () => {
  it("changes only the target task's four fields and stays canonical", () => {
    const out = applySet(text, "A-04", { status: "in_progress", owner: "implementer", evidence: "branch task/A-04, commit abcdef1" });
    const before = text.split("\n");
    const after = out.split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.map((line, i) => [line, before[i]]).filter(([a, b]) => a !== b);
    expect(changed.map(([a]) => a?.trim().split(":")[0])).toEqual(['"status"', '"owner"', '"evidence"']);
    expect(JSON.stringify(JSON.parse(out), null, 2) + "\n").toBe(out);
  });

  it("derives passes from status both ways", () => {
    const done = applySet(text, "A-04", { status: "done", evidence: "PR #5" });
    expect(findTask(JSON.parse(done), "A-04").passes).toBe(true);
    const back = applySet(done, "A-04", { status: "blocked", evidence: "waiting on a review" });
    expect(findTask(JSON.parse(back), "A-04").passes).toBe(false);
  });

  it("leaves the owner unchanged without --owner and sets it with one", () => {
    expect(findTask(JSON.parse(applySet(text, "A-05", { status: "blocked" })), "A-05").owner).toBe("someone");
    expect(findTask(JSON.parse(applySet(text, "A-05", { status: "blocked", owner: "x" })), "A-05").owner).toBe("x");
  });

  it("refuses an empty owner", () => {
    throwsMessage(() => applySet(text, "A-05", { status: "blocked", owner: "  " }), "owner must not be empty");
  });

  it("caps evidence at 600 characters counted as code points", () => {
    const ref = " PR #1";
    const ok = "a".repeat(MAX_EVIDENCE_CHARS - ref.length) + ref;
    expect(() => applySet(text, "A-04", { status: "in_progress", evidence: ok })).not.toThrow();
    throwsMessage(() => applySet(text, "A-04", { status: "in_progress", evidence: `a${ok}` }), "move longer notes to the PR body");
    const emoji = "😀".repeat(MAX_EVIDENCE_CHARS - ref.length) + ref;
    expect(() => applySet(text, "A-04", { status: "in_progress", evidence: emoji })).not.toThrow();
  });

  it("refuses empty evidence", () => {
    throwsMessage(() => applySet(text, "A-04", { status: "blocked", evidence: "   " }), "1 to 600 characters");
  });

  it("requires PR #n or commit <sha> for in_progress and done", () => {
    throwsMessage(() => applySet(text, "A-04", { status: "in_progress", evidence: "working on it" }), "PR #n");
    throwsMessage(() => applySet(text, "A-04", { status: "done", evidence: "all good" }), "PR #n");
    expect(() => applySet(text, "A-04", { status: "in_progress", evidence: "PR #226" })).not.toThrow();
    expect(() => applySet(text, "A-04", { status: "in_progress", evidence: "commit ccac1f5" })).not.toThrow();
  });

  it("exempts blocked and todo evidence from the naming rule", () => {
    expect(() => applySet(text, "A-04", { status: "blocked", evidence: "waiting on the owner" })).not.toThrow();
    expect(() => applySet(text, "A-04", { status: "todo", evidence: "reset" })).not.toThrow();
  });

  it("refuses done with no evidence, and accepts done on existing named evidence", () => {
    throwsMessage(() => applySet(text, "A-04", { status: "done" }), "needs evidence");
    expect(() => applySet(text, "A-01", { status: "done" })).not.toThrow();
    throwsMessage(() => applySet(text, "A-06", { status: "done" }), "PR #n");
  });

  it("refuses an unknown id, an invalid status and a non-canonical file", () => {
    throwsMessage(() => applySet(text, "Q-1", { status: "done", evidence: "PR #1" }), "no task Q-1");
    throwsMessage(() => applySet(text, "A-04", { status: "finished" }), "unknown status");
    throwsMessage(() => applySet(JSON.stringify(fixture), "A-04", { status: "blocked" }), "canonical");
  });
});

describe("checkTaskFile", () => {
  it("passes at 250,000 bytes and fails at 250,001", () => {
    expect(MAX_FILE_BYTES).toBe(250_000);
    expect(checkTaskFile(250_000, clone())).toEqual([]);
    const problems = checkTaskFile(250_001, clone());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Product Owner");
  });

  it("passes evidence of 600 characters and fails 601", () => {
    const prd = clone();
    prd.phases[0].tasks[0].evidence = "a".repeat(600);
    expect(checkTaskFile(1, prd)).toEqual([]);
    prd.phases[0].tasks[0].evidence = "a".repeat(601);
    const problems = checkTaskFile(1, prd);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("A-01");
  });

  it("ignores null evidence", () => {
    expect(checkTaskFile(1, clone())).toEqual([]);
  });
});

describe("the real tasks/prd.json", () => {
  const real = readFileSync(TASK_FILE, "utf8");
  const prd = JSON.parse(real) as Prd;

  it("resolves next to the script's repo", () => {
    expect(TASK_FILE).toBe(join(process.cwd(), "tasks", "prd.json"));
  });

  it("is within the size and evidence limits", () => {
    expect(checkTaskFile(Buffer.byteLength(real), prd)).toEqual([]);
  });

  it("names the PR or commit in every done task's evidence", () => {
    const done = prd.phases.flatMap((phase) => phase.tasks).filter((t) => t.status === "done");
    expect(done.length).toBeGreaterThan(0);
    for (const t of done) expect(EVIDENCE_REFERENCE.test(t.evidence ?? ""), t.id).toBe(true);
  });
});

describe("the CLI", () => {
  const script = join(process.cwd(), "scripts", "task.mjs");
  const tree = () => {
    const root = mkdtempSync(join(tmpdir(), "task-cli-"));
    mkdirSync(join(root, "repo", "scripts"), { recursive: true });
    mkdirSync(join(root, "repo", "tasks"));
    mkdirSync(join(root, "elsewhere"));
    copyFileSync(script, join(root, "repo", "scripts", "task.mjs"));
    writeFileSync(join(root, "repo", "tasks", "prd.json"), text);
    return { cli: join(root, "repo", "scripts", "task.mjs"), file: join(root, "repo", "tasks", "prd.json"), cwd: join(root, "elsewhere"), root };
  };
  const run = (t: ReturnType<typeof tree>, args: string[]) =>
    spawnSync(process.execPath, [t.cli, ...args], { cwd: t.cwd, encoding: "utf8" });

  it("prints next and show as JSON from any cwd", () => {
    const t = tree();
    const next = run(t, ["next"]);
    expect(next.status).toBe(0);
    expect(JSON.parse(next.stdout).id).toBe("A-03");
    const show = run(t, ["show", "B-02"]);
    expect(show.status).toBe(0);
    expect(JSON.parse(show.stdout)).toMatchObject({ phase: "P2", id: "B-02" });
  });

  it("rewrites only the four fields on set and leaves no temp file", () => {
    const t = tree();
    const evidence = join(t.root, "evidence.txt");
    writeFileSync(evidence, "branch task/A-04, commit abcdef1\n");
    const result = run(t, ["set", "A-04", "--status", "in_progress", "--owner", "implementer", "--evidence-file", evidence]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("A-04\tin_progress\tTitle of A-04");
    const after = readFileSync(t.file, "utf8");
    expect(after).toBe(applySet(text, "A-04", { status: "in_progress", owner: "implementer", evidence: "branch task/A-04, commit abcdef1" }));
    expect(readdirSync(join(t.root, "repo", "tasks"))).toEqual(["prd.json"]);
    expect(statSync(t.file).isFile()).toBe(true);
  });

  it("refuses --title with exit 1 and leaves the file unchanged", () => {
    const t = tree();
    const result = run(t, ["set", "A-04", "--title", "x"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("set changes only status, owner, passes and evidence");
    expect(readFileSync(t.file, "utf8")).toBe(text);
  });

  it("filters list in both flag forms and refuses a bad or misspelled filter", () => {
    const t = tree();
    const spaced = run(t, ["list", "--status", "done"]);
    const equals = run(t, ["list", "--status=done"]);
    expect(spaced.status).toBe(0);
    expect(equals.stdout).toBe(spaced.stdout);
    expect(spaced.stdout.trim().split("\n")).toHaveLength(2);
    for (const args of [["--phaes", "P1"], ["--status=nope"], ["--phase=P9"], ["--status"], ["extra"]]) {
      const result = run(t, ["list", ...args]);
      expect(result.status, args.join(" ")).toBe(1);
      expect(result.stderr).toContain("ERROR task");
      expect(result.stdout).toBe("");
    }
  });

  it("prints usage and exits 1 without a command", () => {
    const result = run(tree(), []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("usage:");
  });
});

describe("agent-facing files", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const mdFiles = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? mdFiles(join(dir, entry.name)) : entry.name.endsWith(".md") ? [join(dir, entry.name)] : [],
    );

  // Frozen on purpose: this also bans a legitimate `gh ... --jq` in a future skill. Change the scan deliberately if that is needed.
  it("never tells agents to use jq (this also bans gh --jq in future skills)", () => {
    const files = [...mdFiles(".claude"), ".claude/workflows/task.js", "AGENTS.md", "WORKFLOW.md"];
    const hits = files.filter((path) => /\bjq\b/.test(read(path)));
    expect(hits).toEqual([]);
  });

  it("tells agents never to load tasks/prd.json whole", () => {
    expect(read("AGENTS.md")).toContain("never load `tasks/prd.json` whole");
  });
});
