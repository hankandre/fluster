// Runs dependency-cruiser over src/ and fails when it read nothing (invariant I8, P0-14).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_PATH = /\.test\.tsx?$|^src\/test\//;
const MAX_NAMED = 20;
const FIX_LINE =
  "Fix: run pnpm install so the typescript-6 dev dependency is present. dependency-cruiser 18.7.2 needs TypeScript below 7 and loads it through scripts/depcruise-typescript-6.mjs. Do not loosen .dependency-cruiser.cjs. See docs/specs/P0-14.md.";

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
  return readdirSync(resolve(root, "src"), { recursive: true })
    .map((entry) => `src/${String(entry).split("\\").join("/")}`)
    .filter((path) => /\.tsx?$/.test(path) && !TEST_PATH.test(path))
    .sort();
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceFiles = listSourceFiles(root);
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/depcruise-typescript-6.mjs",
      "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
      "src",
      "--config",
      ".dependency-cruiser.cjs",
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
    `lint:boundaries: ${result.summary.totalCruised} modules, ${result.summary.totalDependenciesCruised} dependencies, ${sourceFiles.length}/${sourceFiles.length} source files under src/`,
  );
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
