// The Product Owner's write path: add, drop, move and edit tasks in tasks/prd.json, and mark the backlog entries a new task takes.
// Run: node scripts/task-owner.mjs apply <ops.json> --date <YYYY-MM-DD> [--root <dir>]
// All or nothing, in the canonical file format. The status fields (status, owner, passes, evidence) stay with `pnpm task set`.
// There is no operation for `rules`: AGENTS.md and prd rule 15 give a pass add, split, reorder and drop only.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { validateBacklog } from "./check-backlog.mjs";

const TASK_KEYS = ["id", "title", "domain", "model", "skill", "human", "depends_on", "acceptance", "verify"];
const EDITABLE = ["title", "domain", "model", "skill", "depends_on", "human", "verify", "acceptance"];
const NEEDS_APPROVAL = ["acceptance", "human", "verify"];
const STATUS_FIELDS = ["status", "owner", "passes", "evidence"];
const APPROVAL_PATH = /^(docs\/specs\/decisions-[^/]+\.md|docs\/decisions\/[^/]+\.md)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const fail = (message) => {
  throw new Error(`ERROR owner: ${message}`);
};
const isStrings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim() !== "");

const allTasks = (prd) => prd.phases.flatMap((phase) => phase.tasks.map((task) => ({ phase, task })));
const find = (prd, id) => allTasks(prd).find(({ task }) => task.id === id);
const need = (prd, id) => find(prd, id) || fail(`no task ${id}`);

function place(phase, anchorOp, id) {
  const { after, before } = anchorOp;
  if ((after === undefined) === (before === undefined)) fail(`${id}: give exactly one of after and before`);
  const anchor = after ?? before;
  const index = phase.tasks.findIndex((task) => task.id === anchor);
  if (index === -1) fail(`${id}: ${anchor} is not in phase ${phase.id}`);
  return after !== undefined ? index + 1 : index;
}

function checkFields(prd, fields, id) {
  for (const [key, value] of Object.entries(fields)) {
    const ok =
      key === "human"
        ? typeof value === "boolean"
        : key === "depends_on"
          ? Array.isArray(value) && value.every((dep) => typeof dep === "string" && dep !== id && find(prd, dep))
          : key === "acceptance"
            ? isStrings(value) && value.length > 0
            : typeof value === "string" && value.trim() !== "";
    if (!ok) {
      const unknown = key === "depends_on" && Array.isArray(value) ? value.filter((dep) => dep === id || !find(prd, dep)) : [];
      fail(`${id}: ${key} has an invalid value${unknown.length ? `: ${unknown.join(", ")} is not another existing task` : ""}`);
    }
  }
}

function approve(op, readApproval, summary) {
  const path = op.owner_approval;
  if (typeof path !== "string" || !APPROVAL_PATH.test(path)) {
    fail(`${op.id}: editing acceptance, human or verify needs owner_approval, a docs/specs/decisions-*.md or docs/decisions/*.md file`);
  }
  const text = readApproval(path);
  if (text === null || text === undefined) fail(`${op.id}: owner_approval ${path} does not exist`);
  if (!new RegExp(`\\b${op.id}\\b`).test(text)) fail(`${op.id}: owner_approval ${path} does not name ${op.id}`);
  summary.push(`approval: ${op.id} fields ${Object.keys(op.fields).filter((key) => NEEDS_APPROVAL.includes(key)).join(", ")} edited with owner approval ${path}`);
}

function addTask(prd, op, backlogLines, summary) {
  const phase = prd.phases.find((item) => item.id === op.phase) || fail(`add: no phase ${op.phase}`);
  const task = op.task || fail("add: task is missing");
  for (const key of Object.keys(task)) if (!TASK_KEYS.includes(key)) fail(`add ${task.id}: ${key} is not a task field to give (the status fields are set to their defaults)`);
  for (const key of TASK_KEYS) if (!(key in task)) fail(`add ${task.id}: ${key} is missing`);
  if (!new RegExp(`^${phase.id}-\\d{2}$`).test(task.id)) fail(`add ${task.id}: the id must match phase ${phase.id}, such as ${phase.id}-01`);
  if (find(prd, task.id)) fail(`add ${task.id}: ${task.id} already exists`);
  const { id: newId, ...fields } = task;
  checkFields(prd, fields, newId);
  if (!Array.isArray(op.takes) || op.takes.length === 0 || !isStrings(op.takes)) fail(`add ${task.id}: takes must list at least one backlog entry's what`);
  const at = place(phase, op, task.id);
  const fresh = {};
  for (const key of TASK_KEYS) fresh[key] = task[key];
  Object.assign(fresh, { status: "todo", owner: null, passes: false, evidence: "" });
  phase.tasks.splice(at, 0, fresh);
  for (const what of op.takes) {
    const hits = backlogLines.map((line, i) => ({ i, value: line.trim() === "" ? null : JSON.parse(line) })).filter(({ value }) => value && value.what === what);
    if (hits.length !== 1) fail(`add ${task.id}: "${what}" matches ${hits.length} backlog lines, expected exactly one`);
    const { i, value } = hits[0];
    if ("taken_by" in value) fail(`add ${task.id}: "${what}" is already taken by ${value.taken_by}`);
    backlogLines[i] = backlogLines[i].replace(/\}\s*$/, `, "taken_by": ${JSON.stringify(task.id)}}`);
  }
  summary.push(`added ${task.id} to ${phase.id} (takes ${op.takes.length} backlog ${op.takes.length === 1 ? "entry" : "entries"})`);
}

function applyOne(prd, op, ctx) {
  switch (op && op.op) {
    case "add":
      return addTask(prd, op, ctx.backlogLines, ctx.summary);
    case "drop": {
      const { phase, task } = need(prd, op.id);
      if (task.status === "in_progress" || task.status === "done") fail(`${op.id} is ${task.status}; only a todo or blocked task can be dropped`);
      const dependent = allTasks(prd).find((other) => (other.task.depends_on || []).includes(op.id));
      if (dependent) fail(`${dependent.task.id} depends on ${op.id}; edit or drop it first`);
      if (typeof op.why !== "string" || op.why.trim() === "") fail(`drop ${op.id}: why is missing`);
      phase.tasks.splice(phase.tasks.indexOf(task), 1);
      ctx.summary.push(`dropped ${op.id}`);
      return undefined;
    }
    case "move": {
      const { phase: from, task } = need(prd, op.id);
      const target = prd.phases.find((item) => item.id === op.phase) || fail(`move ${op.id}: no phase ${op.phase}`);
      if (op.after === op.id || op.before === op.id) fail(`move ${op.id}: cannot anchor on itself`);
      from.tasks.splice(from.tasks.indexOf(task), 1);
      target.tasks.splice(place(target, op, op.id), 0, task);
      ctx.summary.push(`moved ${op.id} to ${target.id}`);
      return undefined;
    }
    case "edit": {
      const { task } = need(prd, op.id);
      const fields = op.fields && typeof op.fields === "object" ? op.fields : fail(`edit ${op.id}: fields is missing`);
      for (const key of Object.keys(fields)) {
        if (STATUS_FIELDS.includes(key)) fail(`edit ${op.id}: ${key} changes only through pnpm task set`);
        if (key === "id") fail(`edit ${op.id}: the id cannot be edited; drop and add instead`);
        if (!EDITABLE.includes(key)) fail(`edit ${op.id}: ${key} is not an editable field`);
      }
      if (Object.keys(fields).some((key) => NEEDS_APPROVAL.includes(key))) approve(op, ctx.readApproval, ctx.summary);
      checkFields(prd, fields, op.id);
      Object.assign(task, fields);
      ctx.summary.push(`edited ${op.id}: ${Object.keys(fields).join(", ")}`);
      return undefined;
    }
    default:
      return fail(`unknown operation ${JSON.stringify(op && op.op)}`);
  }
}

// files: { prd, backlog } as text. Returns the new texts and a summary; throws, changing nothing, on any problem.
export function applyOps(files, ops, { date, readApproval }) {
  if (!DATE.test(date || "")) fail("--date must be YYYY-MM-DD");
  if (!Array.isArray(ops) || ops.length === 0) fail("the operations file must hold a non-empty list");
  const prd = JSON.parse(files.prd);
  if (JSON.stringify(prd, null, 2) + "\n" !== files.prd) fail("tasks/prd.json is not in its canonical 2-space JSON format");
  const ctx = { backlogLines: files.backlog.split("\n"), summary: [], readApproval };
  for (const op of ops) applyOne(prd, op, ctx);
  prd.updated = date;
  const backlog = ctx.backlogLines.join("\n");
  const errors = validateBacklog(backlog);
  if (errors.length > 0) fail(`the backlog would no longer validate: ${errors[0]}`);
  const ids = allTasks(prd).map(({ task }) => task.id);
  if (new Set(ids).size !== ids.length) fail("a task id would repeat");
  return { prd: JSON.stringify(prd, null, 2) + "\n", backlog, summary: ctx.summary };
}

function main(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { date: { type: "string" }, root: { type: "string" } }, strict: true });
  if (positionals[0] !== "apply" || positionals.length !== 2) fail("usage: node scripts/task-owner.mjs apply <ops.json> --date <YYYY-MM-DD> [--root <dir>]");
  const root = values.root ?? ROOT;
  const prdFile = join(root, "tasks", "prd.json");
  const backlogFile = join(root, "tasks", "backlog.jsonl");
  const ops = JSON.parse(readFileSync(positionals[1], "utf8"));
  const readApproval = (path) => {
    try {
      return readFileSync(join(root, path), "utf8");
    } catch {
      return null;
    }
  };
  const out = applyOps({ prd: readFileSync(prdFile, "utf8"), backlog: readFileSync(backlogFile, "utf8") }, ops, { date: values.date, readApproval });
  for (const [file, text] of [[prdFile, out.prd], [backlogFile, out.backlog]]) {
    const temp = join(dirname(file), `.${process.pid}.tmp`);
    writeFileSync(temp, text);
    renameSync(temp, file);
  }
  console.log(out.summary.join("\n"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
