import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Acceptance for P13-17: Sign out is reachable only from Settings (P13-06 Decision 1). The gallery shows a
// dev-only demo button with no handler.
const srcDir = join(__dirname, "..");
const SIGN_OUT_CALL = /\.signOut\(/;
const SIGN_OUT_TEXT = /Sign out/;
const TEXT_ALLOWED = ["settings/", "gallery/gallery-view.tsx"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = ["features", "components"]
  .flatMap((folder) => {
    try {
      return sourceFiles(join(srcDir, folder));
    } catch {
      return [];
    }
  })
  .map((file) => relative(srcDir, file).split("\\").join("/"));

describe("Sign out reach", () => {
  it("calls signOut only under features/settings/", () => {
    const offenders = files.filter((file) => SIGN_OUT_CALL.test(readFileSync(join(srcDir, file), "utf8")) && !file.startsWith("features/settings/"));
    expect(offenders).toEqual([]);
  });

  it("shows the words Sign out only in Settings and the gallery demo", () => {
    const offenders = files.filter((file) => {
      if (!SIGN_OUT_TEXT.test(readFileSync(join(srcDir, file), "utf8"))) return false;
      return !TEXT_ALLOWED.some((allowed) => file.replace(/^features\//, "").startsWith(allowed));
    });
    expect(offenders).toEqual([]);
  });

  it("finds what it should (self-check)", () => {
    expect(SIGN_OUT_CALL.test("await session.signOut();")).toBe(true);
    expect(SIGN_OUT_TEXT.test(">Sign out</button>")).toBe(true);
    expect(SIGN_OUT_CALL.test("signOutLabel")).toBe(false);
    expect(files.some((file) => file.startsWith("features/settings/"))).toBe(true);
  });
});
