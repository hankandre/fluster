// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findGhostTerms, objectLines } from "./check-ghost-terms.mjs";

const file = (path: string, text: string) => ({ path, text });

const prd = JSON.stringify(
  {
    rules: ["Keep the tag desktop-tauri-final."],
    phases: [
      {
        id: "T1",
        tasks: [
          { id: "T1-10", title: "Backlog", acceptance: ["plain"] },
          { id: "T1-11", title: "Ghost terms", acceptance: ["fails on tauri, src-tauri, WebKitGTK or AppImage"] },
        ],
      },
      { id: "T16", name: "Desktop", tasks: [{ id: "T16-01", acceptance: ["revive the Tauri shell?"] }] },
    ],
  },
  null,
  2,
);

describe("findGhostTerms", () => {
  it.each(["tauri", "Tauri", "src-tauri", "WebKitGTK", "webkitgtk", "AppImage", "APPIMAGE"])(
    "fails on %s and names the file and line",
    (term) => {
      const problems = findGhostTerms([file("README.md", `first line\nbuilt with ${term} once`)]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("README.md:2");
      expect(problems[0]).toContain("describe the TV app, or move the text to a decision record");
    },
  );

  it("passes on text without the terms", () => {
    expect(findGhostTerms([file("README.md", "Octave on Android TV")])).toEqual([]);
  });

  it("exempts docs/decisions/", () => {
    expect(findGhostTerms([file("docs/decisions/0003-tv-and-mobile-shell.md", "Tauri and AppImage")])).toEqual([]);
  });

  it("exempts the check's own term list and tests", () => {
    expect(findGhostTerms([file("scripts/check-ghost-terms.mjs", "tauri"), file("scripts/check-ghost-terms.test.ts", "tauri")])).toEqual([]);
  });

  it("exempts the exact tag name but not a term beside it", () => {
    expect(findGhostTerms([file("WORKFLOW.md", "See the tag desktop-tauri-final.")])).toEqual([]);
    expect(findGhostTerms([file("WORKFLOW.md", "desktop-tauri-final and Tauri")])).toHaveLength(1);
    expect(findGhostTerms([file("WORKFLOW.md", "desktop-tauri-finale")])).toHaveLength(1);
  });

  it("exempts the T1-11 task and the T16 phase in tasks/prd.json, and nothing else there", () => {
    expect(findGhostTerms([file("tasks/prd.json", prd)])).toEqual([]);
    const leaked = prd.replace('"plain"', '"tauri leaked"');
    const problems = findGhostTerms([file("tasks/prd.json", leaked)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/tasks\/prd\.json:\d+: "tauri"/);
  });

  it("does not exempt the same ids in other files", () => {
    expect(findGhostTerms([file("tasks/other.json", prd)]).length).toBeGreaterThan(0);
  });

  it("fails when tasks/prd.json loses an exempted entry", () => {
    const problems = findGhostTerms([file("tasks/prd.json", JSON.stringify({ phases: [] }))]);
    expect(problems.join("\n")).toContain('cannot find the "T1-11" entry');
    expect(problems.join("\n")).toContain('cannot find the "T16" entry');
  });
});

describe("objectLines", () => {
  it("finds the whole object around an id, braces inside strings included", () => {
    const text = '{\n  "a": [\n    {\n      "id": "X",\n      "s": "} not the end {"\n    }\n  ]\n}';
    expect(objectLines(text, "X")).toEqual([3, 6]);
    expect(objectLines(text, "Y")).toBeUndefined();
  });
});
