import { describe, expect, it } from "vitest";
import { timeLeftLabel, timeLeftSpoken } from "./time-left";

const MINUTE = 600_000_000;

describe("time left", () => {
  it("rounds under a minute up to one minute", () => {
    expect(timeLeftLabel(500)).toBe("1 min left");
    expect(timeLeftSpoken(500)).toBe("1 minute left");
    expect(timeLeftLabel(0)).toBe("1 min left");
  });

  it("formats minutes", () => {
    expect(timeLeftLabel(38 * MINUTE)).toBe("38 min left");
    expect(timeLeftSpoken(38 * MINUTE)).toBe("38 minutes left");
  });

  it("rounds up partial minutes", () => {
    expect(timeLeftLabel(37 * MINUTE + 1)).toBe("38 min left");
  });

  it("formats exact hours", () => {
    expect(timeLeftLabel(60 * MINUTE)).toBe("1 h left");
    expect(timeLeftSpoken(60 * MINUTE)).toBe("1 hour left");
    expect(timeLeftSpoken(120 * MINUTE)).toBe("2 hours left");
  });

  it("formats hours and minutes", () => {
    expect(timeLeftLabel(64 * MINUTE)).toBe("1 h 4 min left");
    expect(timeLeftSpoken(64 * MINUTE)).toBe("1 hour 4 minutes left");
    expect(timeLeftSpoken(61 * MINUTE)).toBe("1 hour 1 minute left");
  });
});
