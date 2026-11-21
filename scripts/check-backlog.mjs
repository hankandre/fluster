// Validate tasks/backlog.jsonl: one JSON object per line (see WORKFLOW.md §2a).
// Run: node scripts/check-backlog.mjs [path]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BACKLOG_FILE = fileURLToPath(new URL("../tasks/backlog.jsonl", import.meta.url));
export const REQUIRED_FIELDS = ["what", "why", "source", "size", "date"];
export const SIZES = ["S", "M", "L"];
export const TASK_ID = /^T\d+-\d+$/;

const KNOWN_KEYS = [...REQUIRED_FIELDS, "taken_by"];
const NAME = "tasks/backlog.jsonl";

const isRealDate = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === text;
};

export function validateBacklog(text) {
  const errors = [];
  const report = (lineNumber, problem, fix) => {
    errors.push(`ERROR backlog: ${NAME}:${lineNumber}: ${problem}; ${fix}`);
  };
  if (text === "") return errors;
  if (!text.endsWith("\n")) {
    errors.push(`ERROR backlog: ${NAME}: the file does not end with a newline; add one, because a union merge can glue two lines together`);
  }
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const firstSeen = new Map();
  const firstWhat = new Map();
  lines.forEach((raw, index) => {
    const n = index + 1;
    if (raw.includes("\r")) report(n, "the line has a CRLF line ending", "use LF line endings");
    if (raw.trim() === "") {
      report(n, "the line is empty", "delete the empty line");
      return;
    }
    if (firstSeen.has(raw)) {
      report(n, `the line repeats line ${firstSeen.get(raw)} exactly`, "this entry was kept twice by a union merge, so delete one copy");
    } else {
      firstSeen.set(raw, n);
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      report(n, "the line is not valid JSON", "write one JSON object per line");
      return;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      report(n, "the line is not a JSON object", "write one JSON object per line");
      return;
    }
    for (const key of Object.keys(value)) {
      if (!KNOWN_KEYS.includes(key)) report(n, `unknown key ${key}`, `use only ${KNOWN_KEYS.join(", ")}`);
    }
    for (const field of REQUIRED_FIELDS) {
      if (typeof value[field] !== "string" || value[field].trim() === "") {
        report(n, `${field} is missing, blank or not a string`, `give ${field} as a non-empty string`);
      }
    }
    if (typeof value.size === "string" && value.size.trim() !== "" && !SIZES.includes(value.size)) {
      report(n, `size ${JSON.stringify(value.size)} is not allowed`, "use one of S, M or L");
    }
    if (typeof value.date === "string" && value.date.trim() !== "" && !isRealDate(value.date)) {
      report(n, `date ${JSON.stringify(value.date)} is not a real YYYY-MM-DD date`, "write the date as YYYY-MM-DD");
    }
    if ("taken_by" in value && !(typeof value.taken_by === "string" && TASK_ID.test(value.taken_by))) {
      report(n, "taken_by is not a task id such as T12-01", "set a T task id or remove taken_by");
    }
    if (typeof value.what === "string" && value.what.trim() !== "") {
      const what = value.what.trim();
      if (firstWhat.has(what)) {
        if (!firstSeen.has(raw) || firstSeen.get(raw) === n) {
          report(n, `what repeats line ${firstWhat.get(what)}`, "this entry was kept twice by a union merge, so keep the newer line and delete the other");
        }
      } else {
        firstWhat.set(what, n);
      }
    }
  });
  return errors;
}

function main(argv) {
  const path = argv[0] ?? BACKLOG_FILE;
  const errors = validateBacklog(readFileSync(path, "utf8"));
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("backlog ok");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
