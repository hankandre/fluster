// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { BACKLOG_FILE, validateBacklog } from "./check-backlog.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const entry = (extra: Record<string, unknown> = {}) => ({
  what: "Do one thing",
  why: "It is needed",
  source: "T1-10",
  size: "S",
  date: "2026-11-20",
  ...extra,
});
const line = (extra: Record<string, unknown> = {}) => JSON.stringify(entry(extra));
const file = (...lines: string[]) => lines.join("\n") + "\n";

describe("validateBacklog", () => {
  it("accepts an entry with and without taken_by", () => {
    expect(validateBacklog(file(line()))).toEqual([]);
    expect(validateBacklog(file(line({ taken_by: "T12-01" })))).toEqual([]);
  });

  it("accepts an empty file", () => {
    expect(validateBacklog("")).toEqual([]);
  });

  it("reports a line that is not JSON", () => {
    const errors = validateBacklog(file(line(), "{not json"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:2: /);
  });

  it.each([["[]"], ['"text"'], ["12"], ["null"]])("reports %s as not an object", (text) => {
    const errors = validateBacklog(text + "\n");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:1: .*object/);
  });

  for (const key of ["what", "why", "source", "size", "date"]) {
    it(`reports ${key} when missing, blank or a number`, () => {
      const missing: Record<string, unknown> = entry();
      delete missing[key];
      for (const text of [JSON.stringify(missing), line({ [key]: "  " }), line({ [key]: 5 })]) {
        const errors = validateBacklog(text + "\n");
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toMatch(new RegExp(`^ERROR backlog: tasks/backlog\\.jsonl:1: .*${key}`));
      }
    });
  }

  it.each([["XL"], ["s"], ["S to M"]])("reports size %s", (size) => {
    const errors = validateBacklog(file(line({ size })));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:1: .*size.*S, M or L/);
  });

  it.each([["2026-13-01"], ["2026-02-30"], ["20261120"]])("reports date %s", (date) => {
    const errors = validateBacklog(file(line({ date })));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:1: .*date/);
  });

  it.each([["P16-14"], [null], [""]])("reports taken_by %j", (taken) => {
    const errors = validateBacklog(file(line({ taken_by: taken })));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:1: .*taken_by/);
  });

  it("reports an unknown key", () => {
    const errors = validateBacklog(file(line({ "taken-by": "T1-01" })));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:1: .*taken-by/);
  });

  it("reports an exact repeat and names the earlier line", () => {
    const errors = validateBacklog(file(line(), line({ what: "Other" }), line()));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:3: .*line 1/);
  });

  it("reports a repeated what with a different taken_by", () => {
    const errors = validateBacklog(file(line(), line({ taken_by: "T12-01" })));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:2: .*what.*line 1/);
  });

  it("reports an empty middle line", () => {
    const errors = validateBacklog(line() + "\n\n" + line({ what: "Other" }) + "\n");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: tasks\/backlog\.jsonl:2: .*empty/);
  });

  it("reports a CRLF line", () => {
    const errors = validateBacklog(line() + "\r\n");
    expect(errors.some((e) => /^ERROR backlog: tasks\/backlog\.jsonl:1: .*CRLF/.test(e))).toBe(true);
  });

  it("reports a missing final newline", () => {
    const errors = validateBacklog(line());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ERROR backlog: .*newline/);
  });

  it("reports every problem on one line", () => {
    const errors = validateBacklog(file(line({ size: "XL", date: "nope", extra: 1 })));
    expect(errors).toHaveLength(3);
  });
});

describe("the real backlog", () => {
  it("is valid", () => {
    expect(validateBacklog(readFileSync(BACKLOG_FILE, "utf8"))).toEqual([]);
  });

  it("resolves to tasks/backlog.jsonl in the repository", () => {
    expect(BACKLOG_FILE).toBe(join(REPO, "tasks", "backlog.jsonl"));
  });
});

describe("union merge", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const gitEnv = (home: string) => ({
    PATH: process.env.PATH ?? "",
    HOME: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_EDITOR: "true",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  });

  function makeRepo(withAttributes: boolean) {
    const dir = mkdtempSync(join(tmpdir(), "backlog-merge-"));
    dirs.push(dir);
    const git = (...args: string[]) =>
      spawnSync("git", args, { cwd: dir, env: gitEnv(dir), encoding: "utf8" });
    const must = (...args: string[]) => {
      const result = git(...args);
      expect(result.status, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    };
    const append = (what: string) =>
      writeFileSync(join(dir, "tasks/backlog.jsonl"), readFileSync(join(dir, "tasks/backlog.jsonl"), "utf8") + line({ what }) + "\n");
    must("init", "-b", "main");
    mkdirSync(join(dir, "tasks"));
    if (withAttributes) copyFileSync(join(REPO, ".gitattributes"), join(dir, ".gitattributes"));
    writeFileSync(join(dir, "tasks/backlog.jsonl"), file(line({ what: "base one" }), line({ what: "base two" })));
    must("add", "-A");
    must("commit", "-m", "base");
    must("checkout", "-b", "a");
    append("from a");
    must("commit", "-am", "a");
    must("checkout", "-b", "b", "main");
    append("from b");
    must("commit", "-am", "b");
    must("checkout", "a");
    return { dir, git, must };
  }

  it("merges two appended lines without a conflict", () => {
    const { dir, git } = makeRepo(true);
    const result = git("merge", "--no-edit", "b");
    expect(result.status, result.stderr + result.stdout).toBe(0);
    const text = readFileSync(join(dir, "tasks/backlog.jsonl"), "utf8");
    expect(text.split("\n").filter(Boolean)).toHaveLength(4);
    expect(text).not.toContain("<<<<<<<");
    expect(validateBacklog(text)).toEqual([]);
  });

  it("rebases two appended lines without a conflict", () => {
    const { dir, git } = makeRepo(true);
    const result = git("rebase", "b");
    expect(result.status, result.stderr + result.stdout).toBe(0);
    const text = readFileSync(join(dir, "tasks/backlog.jsonl"), "utf8");
    expect(text.split("\n").filter(Boolean)).toHaveLength(4);
    expect(text).not.toContain("<<<<<<<");
    expect(validateBacklog(text)).toEqual([]);
  });

  it("conflicts without the attribute (control)", () => {
    const { git } = makeRepo(false);
    const result = git("merge", "--no-edit", "b");
    expect(result.status).not.toBe(0);
  });

  it("is set for the real file", () => {
    const out = execFileSync("git", ["check-attr", "merge", "--", "tasks/backlog.jsonl"], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(out.trim()).toBe("tasks/backlog.jsonl: merge: union");
  });
});

describe("rule files", () => {
  const read = (path: string) => readFileSync(join(REPO, path), "utf8");

  it("removes the old file", () => {
    expect(existsSync(join(REPO, "tasks/backlog.md"))).toBe(false);
  });

  it("names the new file and never the old one", () => {
    const tracked = execFileSync("git", ["ls-files", ".claude"], { cwd: REPO, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(0);
    for (const path of ["AGENTS.md", "WORKFLOW.md", "docs/security.md", ...tracked]) {
      expect(read(path), path).not.toContain("backlog.md");
    }
    expect(read("AGENTS.md")).toContain("tasks/backlog.jsonl");
    expect(read("WORKFLOW.md")).toContain("tasks/backlog.jsonl");
  });
});
