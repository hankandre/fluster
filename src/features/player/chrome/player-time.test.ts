import { describe, expect, it } from "vitest";
import { clock, endsAt, remaining } from "./player-time";

describe("player time", () => {
  it("formats a clock, with hours only when needed", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65.9)).toBe("1:05");
    expect(clock(3723)).toBe("1:02:03");
    expect(clock(undefined)).toBe("--:--");
    expect(clock(Number.NaN)).toBe("--:--");
  });

  it("formats time left with a true minus sign", () => {
    expect(remaining(0, 3600)).toBe("−1:00:00");
    expect(remaining(3000, 3600)).toBe("−10:00");
    expect(remaining(4000, 3600)).toBe("−0:00");
    expect(remaining(0, undefined)).toBe("−--:--");
  });

  it("gives the wall-clock end in the viewer's format", () => {
    const now = new Date(2026, 10, 11, 20, 0, 0);
    const expected = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(2026, 10, 11, 21, 30, 0));
    expect(endsAt(now, 5400)).toBe(expected);
    expect(endsAt(now, -5)).toBe(new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(now));
  });
});
