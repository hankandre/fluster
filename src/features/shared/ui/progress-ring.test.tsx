import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProgressRing } from "./progress-ring";

afterEach(cleanup);

const dash = (value: number) => {
  const { container } = render(<ProgressRing value={value} />);
  const fill = container.querySelectorAll("circle")[1];
  const [shown, whole] = (fill.getAttribute("stroke-dasharray") ?? "").split(" ").map(Number);
  return { svg: container.querySelector("svg"), ratio: shown / whole };
};

describe("ProgressRing", () => {
  it("is decorative", () => {
    expect(dash(0.5).svg).toHaveAttribute("aria-hidden", "true");
  });

  it("draws the fraction and clamps it to 0..1", () => {
    expect(dash(0.25).ratio).toBeCloseTo(0.25);
    cleanup();
    expect(dash(7).ratio).toBeCloseTo(1);
    cleanup();
    expect(dash(-1).ratio).toBe(0);
    cleanup();
    expect(dash(Number.NaN).ratio).toBe(0);
  });
});
