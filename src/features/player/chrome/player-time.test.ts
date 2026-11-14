import { describe, expect, it } from "vitest";
import { chapterAt, clock, endsAt, remaining, scrubberValueText, spokenDuration, spokenTime } from "./player-time";

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

  it("finds the chapter at a time: none before the first, the new one exactly at a start, the last after the end", () => {
    const chapters = [{ startSeconds: 10, name: "A" }, { startSeconds: 60, name: "B" }];
    expect(chapterAt(chapters, 5)).toBeUndefined();
    expect(chapterAt(chapters, 10)?.name).toBe("A");
    expect(chapterAt(chapters, 59.9)?.name).toBe("A");
    expect(chapterAt(chapters, 60)?.name).toBe("B");
    expect(chapterAt(chapters, 9999)?.name).toBe("B");
  });
});

describe("spoken time", () => {
  it("says hours, minutes, and seconds, leaving out zero units", () => {
    expect(spokenTime(2479)).toBe("41 minutes 19 seconds");
    expect(spokenTime(7380)).toBe("2 hours 3 minutes");
    expect(spokenTime(3661)).toBe("1 hour 1 minute 1 second");
    expect(spokenTime(45.9)).toBe("45 seconds");
    expect(spokenTime(0)).toBe("0 seconds");
    expect(spokenTime(undefined)).toBeUndefined();
    expect(spokenTime(Number.NaN)).toBeUndefined();
  });

  it("drops seconds from a duration of a minute or more", () => {
    expect(spokenDuration(7399)).toBe("2 hours 3 minutes");
    expect(spokenDuration(125)).toBe("2 minutes");
    expect(spokenDuration(59)).toBe("59 seconds");
  });

  it("reads the position of the duration, or the position alone", () => {
    expect(scrubberValueText(2479, 7380)).toBe("41 minutes 19 seconds of 2 hours 3 minutes");
    expect(scrubberValueText(30, undefined)).toBe("30 seconds");
    expect(scrubberValueText(30, 0)).toBe("30 seconds");
  });
});
