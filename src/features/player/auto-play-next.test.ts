import { describe, expect, it } from "vitest";
import { creditsStart } from "./use-auto-play-next";
import {
  AUTO_PLAY_SECONDS,
  DEFAULT_END_WINDOW_SECONDS,
  autoPlayReducer,
  cardStartSeconds,
  inEndWindow,
  type AutoPlayState,
} from "./auto-play-next";

describe("cardStartSeconds", () => {
  it("is 30 seconds before the end without credits", () => {
    expect(cardStartSeconds(1200)).toBe(1200 - DEFAULT_END_WINDOW_SECONDS);
  });

  it("is the start of the Outro when there is one", () => {
    expect(cardStartSeconds(1200, 1100)).toBe(1100);
  });

  it("is never later than the full countdown before the end", () => {
    expect(cardStartSeconds(1200, 1195)).toBe(1200 - AUTO_PLAY_SECONDS);
  });
});

describe("credits data", () => {
  it("ignores an Outro at zero or before the middle of the video", () => {
    expect(cardStartSeconds(1200, 0)).toBe(1170);
    expect(cardStartSeconds(1200, 300)).toBe(1170);
    expect(cardStartSeconds(1200, 600)).toBe(600);
  });

  it("uses the last Outro segment", () => {
    const outro = (startSeconds: number) => ({ kind: "Outro" as const, startSeconds, endSeconds: startSeconds + 60 });
    expect(creditsStart([outro(100), { kind: "Intro", startSeconds: 0, endSeconds: 30 }, outro(1100)])).toBe(1100);
    expect(creditsStart([{ kind: "Intro", startSeconds: 0, endSeconds: 30 }])).toBeUndefined();
  });
});

describe("inEndWindow", () => {
  it("is true from 30 seconds before the end without credits", () => {
    expect(inEndWindow(1170, 1200)).toBe(true);
    expect(inEndWindow(1169.9, 1200)).toBe(false);
  });

  it("starts at the Outro when one is marked", () => {
    expect(inEndWindow(1099, 1200, 1100)).toBe(false);
    expect(inEndWindow(1100, 1200, 1100)).toBe(true);
  });

  it("is false when the duration or position is not known", () => {
    expect(inEndWindow(0, 0)).toBe(false);
    expect(inEndWindow(Number.NaN, 1200)).toBe(false);
    expect(inEndWindow(5, undefined)).toBe(false);
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
