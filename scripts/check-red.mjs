// Run the failing acceptance tests a test writer froze, and report which are red and which already pass.
// Run: node scripts/check-red.mjs <ID> [--repo <dir>] [--expect red|green]
// Reads docs/specs/<ID>.tests.json and docs/specs/<ID>.md. Prints one JSON line.
// Exit 0: every run is as expected (red before implementation, green with --expect green). 1: an item is not. 2: problems only.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GATE_KINDS, validateManifest } from "./check-flow.mjs";

const TASK_ID = /^T\d+-\d{2}$/;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

function acceptanceRows(spec) {
  const section = spec.split(/^## Acceptance\s*$/m)[1];
  if (section === undefined) return [];
  return section
    .split(/^## /m)[0]
    .split("\n")
    .map((line) => /^\|\s*(\d+)\s*\|/.exec(line) && { n: Number(/^\|\s*(\d+)\s*\|/.exec(line)[1]), line })
    .filter(Boolean);
}

// The spec names a gate with `gate: <kind>` in an item's row of its Acceptance table.
export function parseSpecGates(spec) {
  const gates = {};
  for (const { n, line } of acceptanceRows(spec)) {
    const match = new RegExp(`\\bgate:\\s*(${GATE_KINDS.join("|")})\\b`).exec(line);
    if (match) gates[n] = match[1];
  }
  return gates;
}

export function compareGates(manifest, specGates) {
  const problems = [];
  const entries = Array.isArray(manifest.items) ? manifest.items : [];
  for (const entry of entries) {
    if ("gate" in entry && specGates[entry.item] !== entry.gate) {
      problems.push(`ERROR red: item ${entry.item} is a ${entry.gate} gate in the manifest but the spec does not name it (write gate: ${entry.gate} in its Acceptance row)`);
    }
    if ("run" in entry && specGates[entry.item] !== undefined) {
      problems.push(`ERROR red: item ${entry.item} is named gate: ${specGates[entry.item]} in the spec, so it cannot be a run`);
    }
  }
  for (const [n, kind] of Object.entries(specGates)) {
    if (!entries.some((entry) => entry.item === Number(n))) problems.push(`ERROR red: the spec names item ${n} as gate: ${kind} but the manifest lacks it`);
  }
  return problems;
}

function runItem(entry, repo) {
  const [command, ...rest] = entry.run;
  const out = spawnSync(command === "node" ? process.execPath : command, rest, { cwd: repo, encoding: "utf8", timeout: RUN_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  if (out.error) return { started: false, reason: out.error.code || out.error.message };
  return { started: true, passed: out.status === 0 };
}

// The task's acceptance array in tasks/prd.json is the count check-flow uses, so check-red uses it too.
function acceptanceCountOf(repo, id) {
  try {
    const prd = JSON.parse(readFileSync(join(repo, "tasks", "prd.json"), "utf8"));
    for (const phase of prd.phases || []) {
      for (const task of phase.tasks || []) if (task.id === id) return Array.isArray(task.acceptance) ? task.acceptance.length : null;
    }
  } catch {
    return null;
  }
  return null;
}

// Every path the freeze commit (HEAD) changed, other than the manifest, must be a listed file, so none escapes the freeze.
function unlistedFreezePaths(repo, manifestPath, files) {
  try {
    const out = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "-M", "--root", "HEAD"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return out.split("\n").filter((path) => path && path !== manifestPath && !files.includes(path));
  } catch {
    return [];
  }
}

export function checkRed({ id, repo, expect }) {
  const result = { task: id, expect, red: [], green: [], gates: [], blobs: {}, problems: [] };
  const manifestPath = `docs/specs/${id}.tests.json`;
  let manifest;
  let spec;
  try {
    manifest = JSON.parse(readFileSync(join(repo, manifestPath), "utf8"));
    spec = readFileSync(join(repo, `docs/specs/${id}.md`), "utf8");
  } catch (error) {
    result.problems.push(`ERROR red: cannot read ${manifestPath} or the spec (${error.code || error.message}); run the Tests step first`);
    return { result, status: 2 };
  }
  const rows = acceptanceRows(spec);
  const count = acceptanceCountOf(repo, id);
  if (count === null) result.problems.push(`ERROR red: ${id} has no acceptance items in tasks/prd.json`);
  if (rows.length === 0) result.problems.push(`ERROR red: docs/specs/${id}.md has no Acceptance table rows`);
  else if (count !== null && rows.length !== count) {
    result.problems.push(`ERROR red: docs/specs/${id}.md has ${rows.length} Acceptance rows but tasks/prd.json has ${count} acceptance items; the spec table must match the task`);
  }
  if (count !== null) result.problems.push(...validateManifest(manifest, id, count));
  if (result.problems.length === 0) result.problems.push(...compareGates(manifest, parseSpecGates(spec)));
  if (result.problems.length > 0) return { result, status: 2 };
  for (const path of [manifestPath, ...manifest.files]) {
    try {
      result.blobs[path] = execFileSync("git", ["rev-parse", "--verify", `HEAD:${path}`], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch {
      result.problems.push(`ERROR red: ${path} is not committed at HEAD; commit the tests and the manifest first`);
    }
  }
  for (const path of unlistedFreezePaths(repo, manifestPath, manifest.files)) {
    result.problems.push(`ERROR red: ${path} was changed by the freeze commit but is not in the manifest's files, so it would not be frozen; list it or leave it out of that commit`);
  }
  for (const entry of manifest.items) {
    if ("gate" in entry) {
      result.gates.push({ item: entry.item, kind: entry.gate, why: entry.why });
      continue;
    }
    const ran = runItem(entry, repo);
    if (!ran.started) result.problems.push(`ERROR red: item ${entry.item} cannot start (${ran.reason}): ${entry.run.join(" ")}`);
    else (ran.passed ? result.green : result.red).push(entry.item);
  }
  const unexpected = expect === "red" ? result.green : result.red;
  return { result, status: unexpected.length > 0 ? 1 : result.problems.length > 0 ? 2 : 0 };
}

function main(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { repo: { type: "string" }, expect: { type: "string" } }, strict: true });
  const [id] = positionals;
  const expect = values.expect ?? "red";
  if (positionals.length !== 1 || !TASK_ID.test(id) || (expect !== "red" && expect !== "green")) {
    console.log(JSON.stringify({ task: id ?? null, expect, red: [], green: [], gates: [], blobs: {}, problems: ["ERROR red: usage: node scripts/check-red.mjs <ID> [--repo <dir>] [--expect red|green]"] }));
    process.exit(2);
  }
  const { result, status } = checkRed({ id, repo: values.repo ?? process.cwd(), expect });
  console.log(JSON.stringify(result));
  if (result.problems.length > 0) console.error(result.problems.join("\n"));
  process.exit(status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
