import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

it("shows the one version package.json, tauri.conf.json, and Cargo.toml agree on", () => {
  const pkg = (JSON.parse(read("package.json")) as { version: string }).version;
  const tauri = (JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string }).version;
  const cargo = /^version\s*=\s*"([^"]+)"/m.exec(read("src-tauri/Cargo.toml"))?.[1];
  expect(__APP_VERSION__).toBe(pkg);
  expect(tauri).toBe(pkg);
  expect(cargo).toBe(pkg);
});
