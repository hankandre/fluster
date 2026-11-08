import { describe, expect, it } from "vitest";
import { toMediaSegments } from "./media-segments";

describe("toMediaSegments", () => {
  it("converts ticks to seconds and sorts by start", () => {
    expect(toMediaSegments({
      Items: [
        { Id: "b", Type: "Outro", StartTicks: 25_000_000_000, EndTicks: 26_000_000_000 },
        { Id: "a", Type: "Intro", StartTicks: 100_000_000, EndTicks: 700_000_000 },
      ],
    })).toEqual([
      { kind: "Intro", startSeconds: 10, endSeconds: 70 },
      { kind: "Outro", startSeconds: 2500, endSeconds: 2600 },
    ]);
  });

  it("drops other types and malformed ranges", () => {
    expect(toMediaSegments({
      Items: [
        { Type: "Recap", StartTicks: 0, EndTicks: 100 },
        { Type: "Intro", StartTicks: 500, EndTicks: 500 },
        { Type: "Intro", StartTicks: 500 },
        { Type: "Outro", EndTicks: 500 },
      ],
    })).toEqual([]);
  });

  it("is empty for an empty or missing response", () => {
    expect(toMediaSegments({ Items: [] })).toEqual([]);
    expect(toMediaSegments({ Items: null })).toEqual([]);
    expect(toMediaSegments(undefined)).toEqual([]);
  });
});
