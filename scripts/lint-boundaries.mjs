// Runs dependency-cruiser over packages/core/src and fails when it read nothing (invariant I8, P0-14, T2-02).
// `--root <dir>` cruises <dir>/packages/core/src with this repository's rules; the boundary tests use it.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_SOURCE = "packages/core/src";
const TEST_PATH = /\.test\.ts$/;
const MAX_NAMED = 20;
const FIX_LINE =
  "Fix: run pnpm install so the typescript-6 dev dependency is present. dependency-cruiser 18.8.0 needs TypeScript below 7 and loads it through scripts/typescript-6-resolve.mjs. Do not loosen .dependency-cruiser.cjs. See the mechanical enforcement backlog in WORKFLOW.md.";

/**
 * Returns error messages for a dependency-cruiser JSON result that did not read the code.
 * An empty array means the run is sound. Rule violations are not gaps; `format` reports them.
 */
export function findLintGaps(result, sourceFiles) {
  const messages = [];
  const summary = result?.summary ?? {};
  if (summary.totalCruised === 0) {
    messages.push("ERROR lint:boundaries checked 0 modules, so no import rule ran.");
  }
  for (const issue of summary.environment?.issues ?? []) {
    messages.push(`ERROR lint:boundaries: dependency-cruiser reported ${issue.name}.`);
  }
  const read = new Set((result?.modules ?? []).map((module) => module.source));
  const missing = sourceFiles.filter((file) => !read.has(file));
  for (const file of missing.slice(0, MAX_NAMED)) {
    messages.push(`ERROR lint:boundaries did not read ${file}.`);
  }
  if (missing.length > MAX_NAMED) {
    messages.push(`ERROR lint:boundaries and ${missing.length - MAX_NAMED} more files were not read.`);
  }
  if (messages.length > 0) {
    messages.push(FIX_LINE);
  }
  return messages;
}

export function listSourceFiles(root) {
  return readdirSync(resolve(root, CORE_SOURCE), { recursive: true })
    .map((entry) => `${CORE_SOURCE}/${String(entry).split("\\").join("/")}`)
    .filter((path) => /\.tsx?$/.test(path) && !TEST_PATH.test(path))
    .sort();
}

function parseRoot(args, repo) {
  const index = args.indexOf("--root");
  if (index === -1) return repo;
  const value = args[index + 1];
  if (!value) {
    console.error("ERROR lint:boundaries: --root needs a directory.");
    process.exit(2);
  }
  return resolve(value);
}

async function main() {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const root = parseRoot(process.argv.slice(2), repo);
  const sourceFiles = listSourceFiles(root);
  // The tools and rules come from this repository; only the cruised tree comes from the root.
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(resolve(repo, "scripts/typescript-6-resolve.mjs")).href,
      resolve(repo, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"),
      CORE_SOURCE,
      "--config",
      resolve(repo, ".dependency-cruiser.cjs"),
      "--ts-config",
      resolve(root, "tsconfig.json"),
      "--output-type",
      "json",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] },
  );
  let result;
  try {
    result = JSON.parse(child.stdout);
  } catch {
    console.error(`ERROR lint:boundaries: dependency-cruiser did not produce a result (exit ${child.status}).`);
    process.exit(1);
  }
  const gaps = findLintGaps(result, sourceFiles);
  if (gaps.length > 0) {
    console.error(gaps.join("\n"));
    process.exit(1);
  }
  const { format } = await import("dependency-cruiser");
  const { output, exitCode } = await format(result, { outputType: "err-long" });
  process.stdout.write(output);
  console.log(
    `lint:boundaries: ${result.summary.totalCruised} modules, ${result.summary.totalDependenciesCruised} dependencies, ${sourceFiles.length}/${sourceFiles.length} source files under ${CORE_SOURCE}`,
  );
  process.exit(exitCode > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
