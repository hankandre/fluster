import { describe, expect, it } from "vitest";
import type { LibraryItem } from "./catalog";
import { resumeChoice, startOverChoice } from "./playback";

function libraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "movie",
    name: "Movie",
    type: "Movie",
    resumePositionTicks: 0,
    played: false,
    ...overrides,
  };
}

describe("playback start choices", () => {
  it("carries saved Jellyfin progress only for unfinished items", () => {
    expect(resumeChoice(libraryItem({ resumePositionTicks: 123_000_000 }))).toEqual({
      kind: "resume",
      startPositionTicks: 123_000_000,
    });
    expect(resumeChoice(libraryItem({ resumePositionTicks: 123_000_000, played: true }))).toBeUndefined();
    expect(resumeChoice(libraryItem())).toBeUndefined();
  });

  it("always starts over at zero ticks", () => {
    expect(startOverChoice()).toEqual({ kind: "start-over", startPositionTicks: 0 });
  });
});
