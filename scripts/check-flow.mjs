// Check the test-first flow from git history alone.
// Run: node scripts/check-flow.mjs [--repo <dir>] [--base <ref>] [--task <ID>] [--json]
// Frozen tests: a manifest docs/specs/<ID>.tests.json lists test files that only a commit with a Frozen-Test-Change trailer may change.
// Task list: tasks/prd.json may change only in status, owner, passes and evidence, unless a commit carries a Product-Owner-Pass trailer and logs it.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const MANIFEST_PATH = /^docs\/specs\/(T\d+-\d{2})\.tests\.json$/;
export const GATE_KINDS = ["owner", "device", "review", "ci", "met"];
export const PRD_FILE = "tasks/prd.json";
export const LOG_FILE = "tasks/product-owner-log.md";
const STATUS_FIELDS = ["status", "owner", "passes", "evidence"];
const FROZEN_TRAILER = /^Frozen-Test-Change:\s*(\S+)\s+--\s+(.+)$/;
const OWNER_TRAILER = /^Product-Owner-Pass:\s*\S/;

const bad = (message) => `ERROR manifest: ${message}`;

export function validateManifest(manifest, id, acceptanceCount) {
  const problems = [];
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return [bad("not a JSON object")];
  if (manifest.task !== id) problems.push(bad(`task is ${JSON.stringify(manifest.task)}, expected ${id}`));
  const files = Array.isArray(manifest.files) && manifest.files.every((file) => typeof file === "string" && file !== "") ? manifest.files : null;
  if (files === null) problems.push(bad("files must be a list of paths"));
  const items = Array.isArray(manifest.items) ? manifest.items : null;
  if (items === null) return problems.concat(bad("items must be a list"));
  const seen = new Set();
  let anyRun = false;
  for (const entry of items) {
    const n = entry && entry.item;
    if (!Number.isInteger(n) || n < 1 || n > acceptanceCount) {
      problems.push(bad(`item ${JSON.stringify(n)} is not an acceptance item number from 1 to ${acceptanceCount}`));
      continue;
    }
    if (seen.has(n)) problems.push(bad(`item ${n} is listed more than once`));
    seen.add(n);
    const hasRun = "run" in entry;
    const hasGate = "gate" in entry;
    if (hasRun === hasGate) {
      problems.push(bad(`item ${n} needs exactly one of run and gate`));
    } else if (hasRun) {
      anyRun = true;
      const run = entry.run;
      if (!Array.isArray(run) || run.length === 0 || !run.every((word) => typeof word === "string")) problems.push(bad(`item ${n} run must be a list of words`));
      else if (run[0] !== "node" && run[0] !== "pnpm") problems.push(bad(`item ${n} run must start with node or pnpm`));
    } else {
      if (!GATE_KINDS.includes(entry.gate)) problems.push(bad(`item ${n} gate must be one of ${GATE_KINDS.join(", ")}`));
      if (typeof entry.why !== "string" || entry.why.trim() === "") problems.push(bad(`item ${n} gate needs a why`));
    }
  }
  for (let n = 1; n <= acceptanceCount; n += 1) {
    if (!seen.has(n)) problems.push(bad(`item ${n} has neither a run nor a gate`));
  }
  if (anyRun && files !== null && files.length === 0) problems.push(bad("files is empty although an item has a run"));
  return problems;
}

export function shapeOf(prd) {
  const clone = JSON.parse(JSON.stringify(prd));
  for (const phase of clone.phases || []) {
    for (const task of phase.tasks || []) for (const field of STATUS_FIELDS) delete task[field];
  }
  return clone;
}

const trailerOf = (commit, pattern) => commit.trailers.map((line) => pattern.exec(line)).filter(Boolean);
const short = (sha) => sha.slice(0, 7);

// commits: [{ sha, added, changed, trailers }] oldest first. read and blob take (rev, path) and give text or a blob id, null when absent.
export function findFrozenProblems({ commits, tip, task, read, blob, acceptanceCount }) {
  const problems = [];
  const manifests = [];
  const changes = [];
  const frozen = [];
  const owners = new Map();
  commits.forEach((commit, index) => {
    for (const path of commit.added) {
      const match = MANIFEST_PATH.exec(path);
      if (!match) continue;
      const id = match[1];
      let manifest;
      try {
        manifest = JSON.parse(read(commit.sha, path));
      } catch {
        problems.push(bad(`${path} at ${short(commit.sha)} is not valid JSON`));
        continue;
      }
      const count = acceptanceCount(id);
      if (count === null || count === undefined) {
        problems.push(bad(`${id} has no acceptance items in ${PRD_FILE}`));
        continue;
      }
      problems.push(...validateManifest(manifest, id, count));
      let files = Array.isArray(manifest.files) ? manifest.files : [];
      const authorised = new Map([[path, index]]);
      for (const file of files) authorised.set(file, index);
      for (let later = index + 1; later < commits.length; later += 1) {
        const next = commits[later];
        for (const match of trailerOf(next, FROZEN_TRAILER)) {
          const named = match[1];
          if (!next.changed.includes(named)) continue;
          authorised.set(named, later);
          if (named === path) {
            try {
              const edited = JSON.parse(read(next.sha, path));
              files = Array.isArray(edited.files) ? edited.files : files;
            } catch {
              problems.push(bad(`${path} at ${short(next.sha)} is not valid JSON`));
            }
          }
        }
      }
      const paths = [path].concat(files.filter((file) => file !== path));
      manifests.push({ task: id, freeze: commit.sha, files });
      for (const frozenPath of paths) {
        const at = authorised.get(frozenPath) ?? index;
        const owner = owners.get(frozenPath);
        if (owner && owner !== id) {
          problems.push(`ERROR frozen test: ${frozenPath} is frozen by two manifests (${owner}, ${id})`);
          continue;
        }
        owners.set(frozenPath, id);
        const wanted = blob(commits[at].sha, frozenPath);
        if (blob(tip, frozenPath) !== wanted) {
          problems.push(
            `ERROR frozen test: ${frozenPath} differs from the test writer's version (${short(commits[at].sha)}); restore it with git checkout ${short(commits[at].sha)} -- ${frozenPath}. If the test is wrong, return it in frozenTestProblems; only the Product Owner step may change it.`,
          );
        }
        if (wanted !== null) frozen.push({ path: frozenPath, blob: wanted });
        if (at !== index) {
          const named = trailerOf(commits[at], FROZEN_TRAILER).find((m) => m[1] === frozenPath);
          changes.push({ path: frozenPath, commit: commits[at].sha, reason: named ? named[2] : "" });
        }
      }
    }
  });
  let missingManifest = false;
  if (task) {
    const mine = `docs/specs/${task}.tests.json`;
    if (!manifests.some((manifest) => manifest.task === task)) {
      missingManifest = true;
      const onBase = commits.some((commit) => commit.changed.includes(mine));
      problems.push(
        onBase
          ? `ERROR frozen test: ${mine} already exists on the base, so nothing is frozen; a reopened task needs a new manifest`
          : `ERROR frozen test: no manifest ${mine} was added on this branch; rerun the Tests step, or pass preFlow for a branch that predates the flow`,
      );
    }
  }
  return { problems, manifests, changes, frozen, missingManifest };
}

export function findTaskListProblems({ commits, base, tip, shapeAt }) {
  const baseShape = shapeAt(base);
  const tipShape = shapeAt(tip);
  if (baseShape === tipShape) return { problems: [], changed: false };
  const problem = `ERROR task list: ${PRD_FILE} changed outside status, owner, passes and evidence; only a Product Owner pass adds, drops, moves or rewords tasks. Append the work to tasks/backlog.jsonl instead.`;
  const passes = commits.filter((commit) => trailerOf(commit, OWNER_TRAILER).length > 0 && commit.changed.includes(PRD_FILE) && commit.changed.includes(LOG_FILE));
  const last = passes[passes.length - 1];
  if (!last || shapeAt(last.sha) !== tipShape) return { problems: [problem], changed: true };
  return { problems: [], changed: true };
}

function git(repo, args, allowFail = false) {
  try {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (allowFail) return null;
    throw new Error(`ERROR flow: git ${args.join(" ")} failed: ${String(error.stderr || error.message).trim()}`);
  }
}

const FETCH = "fetch full history with git fetch --unshallow origin main (CI: actions/checkout with fetch-depth: 0)";

export function readRange({ repo, base }) {
  const baseSha = (git(repo, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`], true) || "").trim();
  if (!baseSha) throw new Error(`ERROR flow: base ${base} does not resolve; ${FETCH}`);
  if ((git(repo, ["rev-parse", "--is-shallow-repository"]) || "").trim() === "true") {
    throw new Error(`ERROR flow: this clone is shallow, so the range cannot be read; ${FETCH}`);
  }
  let tip = "HEAD";
  const parents = git(repo, ["rev-list", "--parents", "-n", "1", "HEAD"]).trim().split(" ").slice(1);
  if (parents.length === 2 && git(repo, ["merge-base", "--is-ancestor", parents[0], baseSha], true) !== null) tip = parents[1];
  const tipSha = git(repo, ["rev-parse", tip]).trim();
  const mergeBase = (git(repo, ["merge-base", baseSha, tipSha], true) || "").trim();
  if (!mergeBase) throw new Error(`ERROR flow: no merge base between ${base} and the branch; ${FETCH}`);
  const shas = git(repo, ["rev-list", "--reverse", "--no-merges", `${mergeBase}..${tipSha}`]).split("\n").filter(Boolean);
  const commits = shas.map((sha) => {
    const added = [];
    const changed = [];
    for (const line of git(repo, ["diff-tree", "--no-commit-id", "--name-status", "-r", "-M", "--root", sha]).split("\n").filter(Boolean)) {
      const [status, ...paths] = line.split("\t");
      changed.push(...paths);
      if (status === "A") added.push(...paths);
    }
    const trailers = git(repo, ["log", "-1", "--format=%(trailers:only,unfold)", sha]).split("\n").filter(Boolean);
    return { sha, added, changed, trailers };
  });
  const read = (rev, path) => git(repo, ["show", `${rev}:${path}`], true);
  const blob = (rev, path) => (git(repo, ["rev-parse", "--verify", "--quiet", `${rev}:${path}`], true) || "").trim() || null;
  const shapeAt = (rev) => {
    const text = read(rev, PRD_FILE);
    if (text === null) throw new Error(`ERROR flow: ${PRD_FILE} is missing at ${short(rev)}`);
    return JSON.stringify(shapeOf(JSON.parse(text)));
  };
  const acceptanceCount = (id) => {
    const prd = JSON.parse(read(tipSha, PRD_FILE) ?? "null");
    for (const phase of (prd && prd.phases) || []) {
      for (const item of phase.tasks || []) if (item.id === id) return (item.acceptance || []).length;
    }
    return null;
  };
  return { commits, tip: tipSha, base: mergeBase, read, blob, shapeAt, acceptanceCount };
}

export function checkFlow({ repo, base, task }) {
  const range = readRange({ repo, base });
  const frozen = findFrozenProblems({ ...range, task });
  const list = findTaskListProblems({ commits: range.commits, base: range.base, tip: range.tip, shapeAt: range.shapeAt });
  const problems = frozen.problems.concat(list.problems);
  return {
    ok: problems.length === 0,
    commits: range.commits.length,
    manifests: frozen.manifests,
    changes: frozen.changes,
    frozen: frozen.frozen,
    taskListChanged: list.changed,
    missingManifest: frozen.missingManifest,
    problems,
  };
}

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { repo: { type: "string" }, base: { type: "string" }, task: { type: "string" }, json: { type: "boolean" } },
    strict: true,
  });
  let result;
  try {
    result = checkFlow({ repo: values.repo ?? process.cwd(), base: values.base ?? "origin/main", task: values.task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (values.json) console.log(JSON.stringify({ ok: false, commits: 0, manifests: [], changes: [], frozen: [], taskListChanged: false, missingManifest: false, problems: [message] }));
    console.error(message);
    process.exit(1);
  }
  if (values.json) console.log(JSON.stringify(result));
  if (!result.ok) {
    console.error(result.problems.join("\n"));
    process.exit(1);
  }
  if (!values.json) {
    const frozen = result.manifests.map((manifest) => manifest.task).join(", ");
    console.log(result.commits === 0 ? "flow ok: 0 commits ahead of origin/main" : `flow ok: ${result.commits} commits ahead; frozen ${frozen || "none"}; ${result.changes.length} frozen changes`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
