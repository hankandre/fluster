// @vitest-environment node
// T2-06 acceptance item 4: the suite passes in Node, under Node's own URL and URLSearchParams.
import { describe, expect, it } from "vitest";
import { runUrlConformance } from "./url-conformance";

describe("the URL conformance suite under Node", () => {
  it("reports no failures", () => {
    const report = runUrlConformance();
    expect(report.total).toBeGreaterThan(150);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(report.total);
  });
});
