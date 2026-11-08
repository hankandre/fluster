import { describe, expect, it } from "vitest";
import {
  AUTO_PLAY_SECONDS,
  DEFAULT_END_WINDOW_SECONDS,
  autoPlayReducer,
  endWindowSeconds,
  inEndWindow,
  type AutoPlayState,
} from "./auto-play-next";

describe("endWindowSeconds", () => {
  it("is 30 seconds without credits data", () => {
    expect(endWindowSeconds()).toBe(DEFAULT_END_WINDOW_SECONDS);
  });

  it("is the longer of the credits length and 30 seconds", () => {
    expect(endWindowSeconds(90)).toBe(90);
    expect(endWindowSeconds(12)).toBe(30);
  });
});

describe("inEndWindow", () => {
  it("is true once the time left is within the window", () => {
    expect(inEndWindow(1170, 1200, 30)).toBe(true);
    expect(inEndWindow(1169.9, 1200, 30)).toBe(false);
  });

  it("is false when the duration or position is not known", () => {
    expect(inEndWindow(0, 0, 30)).toBe(false);
    expect(inEndWindow(Number.NaN, 1200, 30)).toBe(false);
    expect(inEndWindow(5, undefined, 30)).toBe(false);
  });
});

describe("autoPlayReducer", () => {
  const idle: AutoPlayState = { secondsLeft: undefined };

  it("starts the countdown when the window is entered", () => {
    expect(autoPlayReducer(idle, { type: "window", inWindow: true })).toEqual({ secondsLeft: AUTO_PLAY_SECONDS });
  });

  it("keeps counting when the window is reported again", () => {
    expect(autoPlayReducer({ secondsLeft: 4 }, { type: "window", inWindow: true })).toEqual({ secondsLeft: 4 });
  });

  it("hides the card when the viewer seeks out of the window", () => {
    expect(autoPlayReducer({ secondsLeft: 4 }, { type: "window", inWindow: false })).toEqual(idle);
  });

  it("counts down one second per tick and stops at zero", () => {
    expect(autoPlayReducer({ secondsLeft: 3 }, { type: "tick" })).toEqual({ secondsLeft: 2 });
    expect(autoPlayReducer({ secondsLeft: 0 }, { type: "tick" })).toEqual({ secondsLeft: 0 });
  });

  it("ignores ticks while hidden", () => {
    expect(autoPlayReducer(idle, { type: "tick" })).toEqual(idle);
  });

  it("restarts from the full countdown after seeking back in", () => {
    const hidden = autoPlayReducer({ secondsLeft: 2 }, { type: "window", inWindow: false });
    expect(autoPlayReducer(hidden, { type: "window", inWindow: true })).toEqual({ secondsLeft: AUTO_PLAY_SECONDS });
  });
});
