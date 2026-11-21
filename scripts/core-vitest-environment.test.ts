import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../packages/core/vitest.config";

const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/core");

describe("core vitest environment", () => {
  it("is a plain object config", () => {
    expect(typeof config).toBe("object");
    expect(typeof config).not.toBe("function");
  });

  it("runs in the node environment", () => {
    expect(config.test?.environment).toBe("node");
  });

  it("sets no per-glob or project environment", () => {
    const keys = Object.keys(config.test ?? {});
    for (const key of ["environmentMatchGlobs", "projects", "workspace"]) {
      expect(keys).not.toContain(key);
    }
  });

  it("has no workspace or projects file", () => {
    expect(existsSync(coreDir)).toBe(true);
    const files = readdirSync(coreDir).filter((f) => /^vitest\.(workspace|projects)\./.test(f));
    expect(files).toEqual([]);
  });
});
