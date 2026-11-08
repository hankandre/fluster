import { describe, expect, it } from "vitest";
import { activeSegment, type MediaSegment } from "./media-segments";

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
