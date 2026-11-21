import { describe, expect, it } from "vitest";
import { systemClock } from "./system-clock";

describe("systemClock", () => {
  it("reports epoch milliseconds", () => {
    expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(1_000);
  });

  it("fires after() once", async () => {
    let fired = 0;
    systemClock.after(1, () => (fired += 1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fired).toBe(1);
  });

  it("does not fire a cancelled after()", async () => {
    let fired = 0;
    const cancel = systemClock.after(1, () => (fired += 1));
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fired).toBe(0);
  });

  it("repeats every() until cancelled", async () => {
    let fired = 0;
    const cancel = systemClock.every(5, () => (fired += 1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    cancel();
    const seen = fired;
    expect(seen).toBeGreaterThanOrEqual(2);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fired).toBe(seen);
  });
});
