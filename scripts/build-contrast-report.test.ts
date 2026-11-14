// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderReport } from "./build-contrast-report.mjs";

const run = (text: string, ratio: number, required = 4.5, fontSizePx = 14, lowest = 1.2) => ({ text, fontSizePx, fontWeight: 400, required, ratio, lowest, x: 0, y: 0, width: 10, height: 10 });

describe("renderReport", () => {
  it("lists failures and a summary per capture, sorted", () => {
    const report = renderReport([
      { capture: "1920x1080/100-b", runs: [run("fine", 7.1)] },
      { capture: "1440x900/100-a", runs: [run("Ends at 9:41 | `pm`", 1.84, 4.5, 14.4, 1.1), run("ok", 5)] },
    ]);
    expect(report).toContain([
      "## Summary",
      "",
      "| Capture | Text runs | Failures |",
      "| --- | --- | --- |",
      "| 1440x900/100-a | 2 | 1 |",
      "| 1920x1080/100-b | 1 | 0 |",
    ].join("\n"));
    expect(report).toContain([
      "## Failures",
      "",
      "| Capture | Text | Size | Needed | Measured | Lowest |",
      "| --- | --- | --- | --- | --- | --- |",
      "| 1440x900/100-a | Ends at 9:41 \\| \\`pm\\` | 14.4 px | 4.5:1 | 1.84:1 | 1.10:1 |",
    ].join("\n"));
    expect(report.startsWith("# Contrast report\n")).toBe(true);
    expect(report.endsWith("\n")).toBe(true);
  });

  it("says so when nothing fails", () => {
    const report = renderReport([{ capture: "1440x900/100-a", runs: [run("ok", 6)] }]);
    expect(report).toContain("## Failures\n\nNo text run is below its threshold.\n");
  });

  it("is deterministic", () => {
    const input = [{ capture: "a", runs: [run("x", 2)] }];
    expect(renderReport(input)).toBe(renderReport(input));
  });
});
