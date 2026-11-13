import { describe, expect, it } from "vitest";
import { scrubStep, scrubTarget } from "./scrub-step";

describe("scrubStep", () => {
  it.each([
    [0, 10],
    [999, 10],
    [1000, 20],
    [1999, 20],
    [2000, 60],
    [3999, 60],
    [4000, 120],
    [60_000, 120],
  ])("steps %i ms held by %i s on a long film", (heldMs, step) => {
    expect(scrubStep(heldMs, 7200)).toBe(step);
  });

  it("caps the step at a fiftieth of the duration", () => {
    expect(scrubStep(10_000, 600)).toBe(12);
  });

  it("never goes under 10 seconds", () => {
    expect(scrubStep(10_000, 60)).toBe(10);
  });
});

describe("scrubTarget", () => {
  it("clamps at both ends in both directions", () => {
    expect(scrubTarget(5, 10, -1, 100)).toBe(0);
    expect(scrubTarget(95, 10, 1, 100)).toBe(100);
    expect(scrubTarget(50, 10, 1, 100)).toBe(60);
    expect(scrubTarget(50, 10, -1, 100)).toBe(40);
  });
});
