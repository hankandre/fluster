// A pass-through filter for fixture output: `pnpm fixture:setup 2>&1 | node tests/integration/check-no-secret.mjs`.
// It buffers stdin, because setup writes .credentials during the run and the values are known only at the end.
// It then prints the output and exits 1 if a secret appears, naming only the key, never the value.
// Secrets: every .credentials value whose key ends in _password, and JELLYSCALE_ADMIN_PASSWORD from .jellyscale.env.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.env.OCTAVE_FIXTURE_DIR ?? dirname(fileURLToPath(import.meta.url));

function pairs(file) {
  let text;
  try {
    text = readFileSync(join(dir, file), "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
    .filter(([key, value]) => key !== "" && value !== "");
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const output = Buffer.concat(chunks).toString("utf8");
process.stdout.write(output);

const secrets = [
  ...pairs(".credentials").filter(([key]) => key.endsWith("_password")),
  ...pairs(".jellyscale.env").filter(([key]) => key === "JELLYSCALE_ADMIN_PASSWORD"),
];
const leaked = secrets.filter(([, value]) => output.includes(value)).map(([key]) => key);
if (leaked.length > 0) {
  for (const key of new Set(leaked)) console.error(`[check-no-secret] output holds the value of ${key}`);
  process.exit(1);
}
