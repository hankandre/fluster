import { describe, expect, it } from "vitest";
import { activeSegment, DEFAULT_SKIP_MODES, offeredSegments, segmentKey, segmentToAutoSkip, type MediaSegment } from "./media-segments";

const intro: MediaSegment = { kind: "Intro", startSeconds: 10, endSeconds: 70 };
const outro: MediaSegment = { kind: "Outro", startSeconds: 1000, endSeconds: 1100 };

describe("activeSegment", () => {
  it("finds the segment containing the position", () => {
    expect(activeSegment([intro, outro], 10)).toBe(intro);
    expect(activeSegment([intro, outro], 1050)).toBe(outro);
  });

  it("is undefined before, between, and after segments", () => {
    expect(activeSegment([intro, outro], 9.9)).toBeUndefined();
    expect(activeSegment([intro, outro], 500)).toBeUndefined();
    expect(activeSegment([intro, outro], 1200)).toBeUndefined();
  });

  it("stops one second before the segment ends", () => {
    expect(activeSegment([intro], 68.9)).toBe(intro);
    expect(activeSegment([intro], 69)).toBeUndefined();
  });

  it("is undefined without segments", () => {
    expect(activeSegment([], 30)).toBeUndefined();
  });
});

describe("offeredSegments", () => {
  it("offers buttons for both kinds by default", () => {
    expect(offeredSegments([intro, outro], DEFAULT_SKIP_MODES, false)).toEqual({ button: [intro, outro], auto: [] });
  });

  it("sorts each kind by its own mode", () => {
    expect(offeredSegments([intro, outro], { intro: "auto", credits: "button" }, false)).toEqual({ button: [outro], auto: [intro] });
    expect(offeredSegments([intro, outro], { intro: "button", credits: "auto" }, false)).toEqual({ button: [intro], auto: [outro] });
    expect(offeredSegments([intro, outro], { intro: "none", credits: "none" }, false)).toEqual({ button: [], auto: [] });
  });

  it("drops credits in every mode while a next episode exists", () => {
    for (const credits of ["button", "auto", "none"] as const) {
      const split = offeredSegments([intro, outro], { intro: "button", credits }, true);
      expect(split).toEqual({ button: [intro], auto: [] });
    }
  });
});

describe("segmentToAutoSkip", () => {
  it("returns the segment the position is inside", () => {
    expect(segmentToAutoSkip([intro], 30, new Set())).toBe(intro);
  });

  it("is undefined before, after, and in the last second", () => {
    expect(segmentToAutoSkip([intro], 5, new Set())).toBeUndefined();
    expect(segmentToAutoSkip([intro], 80, new Set())).toBeUndefined();
    expect(segmentToAutoSkip([intro], 69.5, new Set())).toBeUndefined();
  });

  it("is undefined once the segment is done", () => {
    expect(segmentToAutoSkip([intro], 30, new Set([segmentKey(intro)]))).toBeUndefined();
    expect(segmentToAutoSkip([intro, outro], 1050, new Set([segmentKey(intro)]))).toBe(outro);
  });
});
