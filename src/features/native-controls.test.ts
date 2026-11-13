import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Acceptance for P13-03: features expose no native select, radio, or checkbox. DESIGN.md 12 replaces them with
// Picker, SegmentedTabs, and ToggleChip. The files below predate the primitives; the P13 task named on each line
// migrates the file and removes its entry. The user approved (2026-11-08) adding the acceptance line "Uses only
// shared UI primitives; no native select, radio, or checkbox remains" to P13-09, P13-11, and P13-17. A new file must not be added to this list.
const ALLOWLIST: Record<string, string> = {};

const featuresDir = __dirname;
const NATIVE_CONTROL = /<select[\s>]|type\s*[=:]\s*\{?\s*["'](?:radio|checkbox)["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const usesNativeControl = (file: string) => NATIVE_CONTROL.test(readFileSync(file, "utf8"));

describe("native form controls in features", () => {
  const files = sourceFiles(featuresDir).map((file) => relative(featuresDir, file).split("\\").join("/"));

  it("appear only in the allowlisted files", () => {
    const offenders = files.filter((file) => usesNativeControl(join(featuresDir, file)) && !(file in ALLOWLIST));
    expect(offenders).toEqual([]);
  });

  it("are gone from every shared primitive", () => {
    const shared = files.filter((file) => file.startsWith("shared/"));
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.filter((file) => usesNativeControl(join(featuresDir, file)))).toEqual([]);
  });

  it("keep the allowlist honest: each entry still uses one", () => {
    const stale = Object.keys(ALLOWLIST).filter((file) => !files.includes(file) || !usesNativeControl(join(featuresDir, file)));
    expect(stale).toEqual([]);
  });

  it("detects what it should (self-check)", () => {
    expect(NATIVE_CONTROL.test("<select value={x}>")).toBe(true);
    expect(NATIVE_CONTROL.test('<input type="radio" />')).toBe(true);
    expect(NATIVE_CONTROL.test("<input type='checkbox'")).toBe(true);
    expect(NATIVE_CONTROL.test('<input type="text" />')).toBe(false);
    expect(NATIVE_CONTROL.test("<selected>")).toBe(false);
  });
});
