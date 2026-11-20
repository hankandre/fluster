// Fails when a tracked file names the deleted desktop stack (T1-11).
// The term list below is the only place outside docs/decisions/ that may hold these words.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const GHOST_TERMS = /src-tauri|tauri|webkitgtk|appimage/gi;
export const TAG_NAME = "desktop-tauri-final";
// The tag name alone, not a longer word that starts with it.
const TAG_PATTERN = new RegExp(`${TAG_NAME}(?![\\w-])`, "g");
export const CHECK_FILES = ["scripts/check-ghost-terms.mjs", "scripts/check-ghost-terms.d.mts", "scripts/check-ghost-terms.test.ts"];
const TASK_LIST = "tasks/prd.json";
const EXEMPT_PRD_ENTRIES = ["T1-11", "T16"];
const FIX = "describe the TV app, or move the text to a decision record in docs/decisions/";

/** Returns the [first, last] 1-based line range of the JSON object whose "id" is `id`, or undefined. */
export function objectLines(text, id) {
  const match = new RegExp(`"id"\\s*:\\s*"${id}"`).exec(text);
  if (!match) return undefined;
  const start = text.lastIndexOf("{", match.index);
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        const parsed = JSON.parse(text.slice(start, i + 1));
        if (parsed.id !== id) return undefined;
        const lineOf = (offset) => text.slice(0, offset).split("\n").length;
        return [lineOf(start), lineOf(i)];
      }
    }
  }
  return undefined;
}

function isExemptPath(path) {
  return path.startsWith("docs/decisions/") || CHECK_FILES.includes(path);
}

/**
 * Returns one ERROR line per ghost term found in `files` ({ path, text }).
 * Exempt: docs/decisions/, this check's own files, the exact tag name, and in
 * tasks/prd.json the T1-11 task and the T16 phase.
 */
export function findGhostTerms(files) {
  const problems = [];
  for (const { path, text } of files) {
    if (isExemptPath(path)) continue;
    const exemptRanges = [];
    if (path === TASK_LIST) {
      for (const id of EXEMPT_PRD_ENTRIES) {
        const range = objectLines(text, id);
        if (!range) {
          problems.push(`ERROR ghost terms: ${path}: cannot find the "${id}" entry this check exempts; ${FIX}.`);
          continue;
        }
        exemptRanges.push(range);
      }
    }
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      if (exemptRanges.some(([first, last]) => lineNumber >= first && lineNumber <= last)) return;
      const stripped = line.replace(TAG_PATTERN, "");
      for (const found of stripped.matchAll(GHOST_TERMS)) {
        problems.push(`ERROR ghost terms: ${path}:${lineNumber}: "${found[0]}": ${FIX}.`);
      }
    });
  }
  return problems;
}

function trackedTextFiles() {
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const files = [];
  for (const path of paths) {
    let buffer;
    try {
      buffer = readFileSync(path);
    } catch {
      continue; // deleted in the working tree but still in the index
    }
    if (buffer.includes(0)) continue; // binary
    files.push({ path, text: buffer.toString("utf8") });
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = trackedTextFiles();
  if (files.length === 0) {
    console.error("ERROR ghost terms: git ls-files listed no files; run the check from the repository root.");
    process.exit(1);
  }
  const problems = findGhostTerms(files);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log(`ghost terms: ${files.length} tracked text files, none name the desktop stack`);
}
