import { describe, expect, it } from "vitest";
import { HOLD_MS, isHeld } from "./hold-key";

describe("isHeld", () => {
  it("is false just under the threshold and true at it", () => {
    expect(isHeld(1000, 1000 + HOLD_MS - 1)).toBe(false);
    expect(isHeld(1000, 1000 + HOLD_MS)).toBe(true);
  });
});
