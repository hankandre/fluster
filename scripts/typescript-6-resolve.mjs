// Sends `typescript` imports to the typescript-6 alias for dependency-cruiser and ESLint's TypeScript parser, which do not support TypeScript 7.
// Remove with the typescript-6 alias when both support the app's TypeScript (P0-14, P0-16).
import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = createRequire(join(root, "package.json")).resolve("typescript-6/package.json");
const directory = dirname(packageJson);
const main = JSON.parse(readFileSync(packageJson, "utf8")).main;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "typescript") {
      return { url: pathToFileURL(join(directory, main)).href, shortCircuit: true };
    }
    if (specifier.startsWith("typescript/")) {
      return { url: pathToFileURL(join(directory, specifier.slice("typescript/".length))).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
