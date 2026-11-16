import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The one test in the visual run that is not a capture. It fails whenever a
// scenario is added or removed, and has no actual image.
const MATCH_TEST = "baselines match scenarios";
const CAPTURE_PATH = /^\d+x\d+(-tv)?\/[^/\\]+\.png$/;

// Walks Playwright's JSON report. A capture is a spec titled with the scenario
// name inside a suite titled with the size; a spec outside any size suite is not one.
function collectTests(results) {
  const tests = [];
  const visit = (suite, size) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) tests.push({ size, title: spec.title, test });
    }
    for (const child of suite.suites ?? []) visit(child, child.title);
  };
  for (const root of results.suites ?? []) visit(root, null);
  return tests;
}

function actualOf(test) {
  const attempts = test.results ?? [];
  const last = attempts[attempts.length - 1];
  return (last?.attachments ?? []).some((attachment) => String(attachment.name).endsWith("-actual.png"));
}

// Decides what accept does with a CI run's visual-captures artifact.
//   results   parsed results.json
//   captures  `<size>/<name>.png` paths present in the artifact
//   baselines `<size>/<name>.png` paths present in e2e/visual/baselines
// Returns { refuse: string[], copy: string[], delete: string[] }. A refusal means write nothing.
export function planAccept({ results, captures, baselines }) {
  const refuse = [];
  const entries = collectTests(results);
  const config = results.config ?? {};
  const stats = results.stats ?? {};

  const filtered = (config.argv ?? []).some((arg) => /^(-g|--grep(-invert)?(=.*)?|--shard(=.*)?|--last-failed|--only-changed(=.*)?)$/.test(arg));
  if (filtered || config.shard) refuse.push("The run was filtered (grep, shard, or last-failed), so its test list is not the full list.");
  if ((results.errors ?? []).length > 0) refuse.push("The run reported errors outside any test, so it was cut short.");
  if (config.maxFailures > 0 && stats.unexpected >= config.maxFailures) {
    refuse.push(`The run stopped at its maxFailures limit (${config.maxFailures}), so some captures never ran.`);
  }
  const unfinished = entries.filter(({ test }) => {
    const attempts = test.results ?? [];
    const last = attempts[attempts.length - 1];
    return test.status === "skipped" || last?.status === "interrupted";
  });
  if (unfinished.length > 0) {
    refuse.push(`${unfinished.length} test(s) were skipped or interrupted, so the run was cut short.`);
  }

  const copy = [];
  for (const { size, title, test } of entries) {
    if (size === null || test.status !== "unexpected") continue;
    const path = `${size}/${title}.png`;
    if (!CAPTURE_PATH.test(path)) {
      refuse.push(`A failed test has an unexpected name: ${path}.`);
    } else if (!actualOf(test) || !captures.includes(path)) {
      refuse.push(`${path} failed without a captured image (a timeout or mock drift), so it is not a candidate baseline.`);
    } else {
      copy.push(path);
    }
  }

  // A baseline is deleted only when the baselines test failed and the run's full
  // test list, including tests that did not run, has no scenario for it.
  const matchFailed = entries.some(({ size, title, test }) => size === null && title === MATCH_TEST && test.status === "unexpected");
  const known = new Set(entries.filter(({ size }) => size !== null).map(({ size, title }) => `${size}/${title}.png`));
  const remove = matchFailed ? baselines.filter((path) => !known.has(path)).sort() : [];

  return { refuse, copy: copy.sort(), delete: remove };
}

function listPngs(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const size of readdirSync(root, { withFileTypes: true })) {
    if (!size.isDirectory()) continue;
    for (const file of readdirSync(join(root, size.name))) {
      if (file.endsWith(".png")) out.push(`${size.name}/${file}`);
    }
  }
  return out.sort();
}

// Reads the artifact and baseline directories, plans, and (unless dryRun) applies the plan.
export function acceptRun({ artifactDir, baselineDir, dryRun }) {
  const reportPath = join(artifactDir, "results.json");
  if (!existsSync(reportPath)) {
    return {
      refuse: ["The artifact has no results.json (an older run), so accept cannot tell which captures failed. Rerun CI on a current commit."],
      copy: [],
      delete: [],
    };
  }
  const results = JSON.parse(readFileSync(reportPath, "utf8"));
  const plan = planAccept({ results, captures: listPngs(artifactDir), baselines: listPngs(baselineDir) });
  if (plan.refuse.length > 0 || dryRun) return plan;
  for (const path of plan.copy) {
    mkdirSync(dirname(join(baselineDir, path)), { recursive: true });
    copyFileSync(join(artifactDir, path), join(baselineDir, path));
  }
  for (const path of plan.delete) rmSync(join(baselineDir, path), { force: true });
  return plan;
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const [artifactDir, baselineDir] = argv.filter((arg) => arg !== "--dry-run");
  if (!artifactDir || !baselineDir) {
    console.error("usage: node scripts/visual-accept.mjs <artifact-dir> <baseline-dir> [--dry-run]");
    return 2;
  }
  const plan = acceptRun({ artifactDir, baselineDir, dryRun });
  if (plan.refuse.length > 0) {
    for (const reason of plan.refuse) console.error(`refused: ${reason}`);
    return 1;
  }
  for (const path of plan.copy) console.log(`copy ${path}`);
  for (const path of plan.delete) console.log(`delete ${path}`);
  if (plan.copy.length === 0 && plan.delete.length === 0) console.log("No failed captures to accept.");
  if (dryRun) console.log("Dry run: nothing was written.");
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
