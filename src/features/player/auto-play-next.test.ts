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

describe("the chosen countdown length", () => {
  it("moves the latest card start with the length", () => {
    expect(cardStartSeconds(1200, 1195, 15)).toBe(1185);
    expect(cardStartSeconds(1200, 1195, 5)).toBe(1195);
    expect(cardStartSeconds(1200, 1100, 15)).toBe(1100);
  });

  it("opens the end window by the chosen length", () => {
    expect(inEndWindow(1184, 1200, 1195, 15)).toBe(false);
    expect(inEndWindow(1185, 1200, 1195, 15)).toBe(true);
    expect(inEndWindow(1190, 1200, 1195, 5)).toBe(false);
    expect(inEndWindow(1195, 1200, 1195, 5)).toBe(true);
  });

  it("starts the countdown from the given length, and again after seeking back", () => {
    for (const seconds of [5, 15]) {
      const start = autoPlayReducer({ secondsLeft: undefined, dismissed: false }, { type: "window", inWindow: true, countdownSeconds: seconds });
      expect(start.secondsLeft).toBe(seconds);
      const out = autoPlayReducer(start, { type: "window", inWindow: false });
      expect(autoPlayReducer(out, { type: "window", inWindow: true, countdownSeconds: seconds }).secondsLeft).toBe(seconds);
    }
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
  const idle: AutoPlayState = { secondsLeft: undefined, totalSeconds: undefined, dismissed: false };
  const counting = (secondsLeft: number, totalSeconds = AUTO_PLAY_SECONDS): AutoPlayState => ({ secondsLeft, totalSeconds, dismissed: false });

  it("starts the countdown when the window is entered", () => {
    expect(autoPlayReducer(idle, { type: "window", inWindow: true })).toEqual(counting(AUTO_PLAY_SECONDS));
  });

  it("keeps counting when the window is reported again with the same length", () => {
    expect(autoPlayReducer(counting(4), { type: "window", inWindow: true })).toEqual(counting(4));
    expect(autoPlayReducer(counting(4, 15), { type: "window", inWindow: true, countdownSeconds: 15 })).toEqual(counting(4, 15));
  });

  it("restarts at the new length when the Countdown setting changes while counting", () => {
    expect(autoPlayReducer(counting(4), { type: "window", inWindow: true, countdownSeconds: 20 })).toEqual(counting(20, 20));
  });

  it("starts at the full length when auto-play is turned on with the card showing (the window was cleared before)", () => {
    const off = autoPlayReducer(counting(4), { type: "window", inWindow: false });
    expect(off).toEqual(idle);
    expect(autoPlayReducer(off, { type: "window", inWindow: true, countdownSeconds: 5 })).toEqual(counting(5, 5));
  });

  it("hides the card when the viewer seeks out of the window", () => {
    expect(autoPlayReducer(counting(4), { type: "window", inWindow: false })).toEqual(idle);
  });

  it("counts down one second per tick and stops at zero", () => {
    expect(autoPlayReducer(counting(3), { type: "tick" })).toEqual(counting(2));
    expect(autoPlayReducer(counting(0), { type: "tick" })).toEqual(counting(0));
  });

  it("ignores ticks while hidden", () => {
    expect(autoPlayReducer(idle, { type: "tick" })).toEqual(idle);
  });

  it("restarts from the full countdown after seeking back in", () => {
    const hidden = autoPlayReducer(counting(2), { type: "window", inWindow: false });
    expect(autoPlayReducer(hidden, { type: "window", inWindow: true })).toEqual(counting(AUTO_PLAY_SECONDS));
  });

  it("hide clears the countdown and dismisses the card", () => {
    expect(autoPlayReducer(counting(4), { type: "hide" })).toEqual({ secondsLeft: undefined, totalSeconds: undefined, dismissed: true });
  });

  it("stays hidden when the window is entered again after hide, whatever changes", () => {
    const dismissed = autoPlayReducer(counting(4), { type: "hide" });
    expect(autoPlayReducer(dismissed, { type: "window", inWindow: true })).toEqual(dismissed);
    expect(autoPlayReducer(dismissed, { type: "window", inWindow: true, countdownSeconds: 30 })).toEqual(dismissed);
    expect(autoPlayReducer(dismissed, { type: "window", inWindow: false })).toEqual(dismissed);
    expect(autoPlayReducer(dismissed, { type: "tick" })).toEqual(dismissed);
  });
});
