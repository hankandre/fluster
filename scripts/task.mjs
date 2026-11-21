// Read and update tasks/prd.json without loading it whole into an agent's context.
// Run: node scripts/task.mjs next | show <id> | list [--status s] [--phase p] | set <id> --status s [...]
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const TASK_FILE = fileURLToPath(new URL("../tasks/prd.json", import.meta.url));
export const MAX_FILE_BYTES = 250_000;
export const MAX_EVIDENCE_CHARS = 600;
export const EVIDENCE_REFERENCE = /\bPR #\d+\b|\bcommit [0-9a-f]{7,40}\b/i;

const SET_REFUSAL = "ERROR task: set changes only status, owner, passes and evidence";
const NOT_CANONICAL =
  "ERROR task: tasks/prd.json is not in its canonical 2-space JSON format; refusing to reformat it";
const USAGE = [
  "usage: pnpm task next",
  "       pnpm task show <id>",
  "       pnpm task list [--status s] [--phase p]",
  "       pnpm task set <id> --status s [--owner o] [--evidence-file f]",
  "A machine consumer should run: node scripts/task.mjs <command>",
].join("\n");

const fail = (message) => {
  throw new Error(message);
};

const allTasks = (prd) => prd.phases.flatMap((phase) => phase.tasks.map((task) => ({ phase: phase.id, task })));

export function nextTask(prd) {
  const passing = new Set(allTasks(prd).filter(({ task }) => task.passes === true).map(({ task }) => task.id));
  for (const { phase, task } of allTasks(prd)) {
    if (task.status !== "todo" || task.human === true) continue;
    if ((task.depends_on || []).every((id) => passing.has(id))) return { phase, ...task };
  }
  return null;
}

export function findTask(prd, id) {
  const hit = allTasks(prd).find(({ task }) => task.id === id);
  if (!hit) fail(`ERROR task: no task ${id}`);
  return { phase: hit.phase, ...hit.task };
}

export function listLines(prd, filters = {}) {
  if (filters.status !== undefined && !(prd.status_values || []).includes(filters.status)) {
    fail(`ERROR task: unknown status ${filters.status}`);
  }
  if (filters.phase !== undefined && !prd.phases.some((phase) => phase.id === filters.phase)) {
    fail(`ERROR task: unknown phase ${filters.phase}`);
  }
  return allTasks(prd)
    .filter(({ phase, task }) => (filters.status === undefined || task.status === filters.status) && (filters.phase === undefined || phase === filters.phase))
    .map(({ task }) => `${task.id}\t${task.status}\t${task.title}`);
}

export function parseSetArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        status: { type: "string" },
        owner: { type: "string" },
        "evidence-file": { type: "string" },
      },
    });
  } catch (error) {
    if (error && error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") fail(SET_REFUSAL);
    fail(`ERROR task: ${error.message}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) fail("ERROR task: set takes exactly one task id");
  if (values.status === undefined) fail("ERROR task: set requires --status");
  return { id: positionals[0], status: values.status, owner: values.owner, evidenceFile: values["evidence-file"] };
}

const length = (text) => Array.from(text).length;

export function applySet(text, id, opts) {
  const prd = JSON.parse(text);
  if (JSON.stringify(prd, null, 2) + "\n" !== text) fail(NOT_CANONICAL);
  const hit = allTasks(prd).find(({ task }) => task.id === id);
  if (!hit) fail(`ERROR task: no task ${id}`);
  const task = hit.task;
  if (!(prd.status_values || []).includes(opts.status)) fail(`ERROR task: unknown status ${opts.status}`);
  if (opts.owner !== undefined && opts.owner.trim() === "") fail("ERROR task: owner must not be empty");
  let evidence = task.evidence;
  if (opts.evidence !== undefined) {
    evidence = opts.evidence.trim();
    if (evidence === "" || length(evidence) > MAX_EVIDENCE_CHARS) {
      fail(`ERROR task: evidence must be 1 to ${MAX_EVIDENCE_CHARS} characters; move longer notes to the PR body`);
    }
  }
  const needsReference = opts.status === "in_progress" || opts.status === "done";
  const hasEvidence = typeof evidence === "string" && evidence.trim() !== "";
  if (opts.status === "done" && !hasEvidence) fail("ERROR task: status done needs evidence naming the PR or commit");
  if (needsReference && (opts.evidence !== undefined || opts.status === "done") && !EVIDENCE_REFERENCE.test(evidence || "")) {
    fail("ERROR task: evidence must name the PR (PR #n) or commit (commit <sha>)");
  }
  task.status = opts.status;
  task.passes = opts.status === "done";
  if (opts.owner !== undefined) task.owner = opts.owner;
  if (opts.evidence !== undefined) task.evidence = evidence;
  return JSON.stringify(prd, null, 2) + "\n";
}

export function checkTaskFile(byteLength, prd) {
  const problems = [];
  if (byteLength > MAX_FILE_BYTES) {
    problems.push(
      `ERROR task file: tasks/prd.json is ${byteLength} bytes, over ${MAX_FILE_BYTES}; trim or move finished phases in a Product Owner pass`,
    );
  }
  for (const { task } of allTasks(prd)) {
    if (typeof task.evidence === "string" && length(task.evidence) > MAX_EVIDENCE_CHARS) {
      problems.push(
        `ERROR task file: ${task.id} evidence is ${length(task.evidence)} characters, over ${MAX_EVIDENCE_CHARS}; move longer notes to the PR body`,
      );
    }
  }
  return problems;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined) fail(`ERROR task: ${name} needs a value`);
  return value;
}

function main(argv) {
  const [command, ...rest] = argv;
  const read = () => readFileSync(TASK_FILE, "utf8");
  switch (command) {
    case "next":
      console.log(JSON.stringify(nextTask(JSON.parse(read())), null, 2));
      return;
    case "show":
      if (rest.length !== 1) fail("ERROR task: show takes exactly one task id");
      console.log(JSON.stringify(findTask(JSON.parse(read()), rest[0]), null, 2));
      return;
    case "list": {
      const lines = listLines(JSON.parse(read()), { status: option(rest, "--status"), phase: option(rest, "--phase") });
      if (lines.length > 0) console.log(lines.join("\n"));
      return;
    }
    case "set": {
      const args = parseSetArgs(rest);
      const evidence = args.evidenceFile === undefined ? undefined : readFileSync(args.evidenceFile, "utf8");
      const next = applySet(read(), args.id, { status: args.status, owner: args.owner, evidence });
      const temp = join(dirname(TASK_FILE), `.prd.json.${process.pid}.tmp`);
      writeFileSync(temp, next);
      renameSync(temp, TASK_FILE);
      console.log(listLines(JSON.parse(next)).find((line) => line.startsWith(`${args.id}\t`)));
      return;
    }
    default:
      console.error(USAGE);
      process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
