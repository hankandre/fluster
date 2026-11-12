import { describe, expect, it } from "vitest";
import { conversionCopy, fractionCopy, seekCopy, subtitleCopy, volumeCopy } from "./osd-copy";

describe("osd copy", () => {
  it("writes seeks with a signed number of seconds", () => {
    expect(seekCopy(10)).toBe("+10 s");
    expect(seekCopy(-10)).toBe("−10 s");
  });

  it("writes volume as a rounded percent", () => {
    expect(volumeCopy(65)).toBe("Volume 65%");
    expect(volumeCopy(99.6)).toBe("Volume 100%");
  });

  it("names the subtitle chosen, off, or the lack of any", () => {
    expect(subtitleCopy("English (SDH)")).toBe("Subtitles: English (SDH)");
    expect(subtitleCopy(undefined)).toBe("Subtitles: Off");
    expect(subtitleCopy(null)).toBe("No subtitles");
  });

  it("writes number-key jumps as percents", () => {
    expect(fractionCopy(0)).toBe("0%");
    expect(fractionCopy(0.3)).toBe("30%");
    expect(fractionCopy(0.9)).toBe("90%");
  });

  it("adds the burned-in line to the conversion notice", () => {
    expect(conversionCopy("Converting on server: x", false)).toBe("Converting on server: x");
    expect(conversionCopy("Converting on server: x", true)).toBe("Converting on server: x · Subtitles are burned in");
  });
});
