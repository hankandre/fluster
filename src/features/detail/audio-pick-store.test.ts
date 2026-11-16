import { afterEach, describe, expect, it } from "vitest";
import { forgetAudioPick, heldAudioPick, holdAudioPick } from "./audio-pick-store";

const pick = { scope: 1, itemId: "m1", mediaSourceId: "src", audioStreamIndex: 2 };

afterEach(() => {
  forgetAudioPick();
  window.location.hash = "";
});

describe("audio pick store (P17-08)", () => {
  it("holds a pick for its account and title only", () => {
    window.location.hash = "#/next/item/m1";
    holdAudioPick(pick);
    expect(heldAudioPick(1, "m1")).toEqual(pick);
    expect(heldAudioPick(2, "m1")).toBeUndefined();
    expect(heldAudioPick(1, "m2")).toBeUndefined();
  });

  it("keeps the pick while the player of the same title is open, and forgets it elsewhere", () => {
    window.location.hash = "#/next/item/m1";
    holdAudioPick(pick);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.location.hash = "#/next/play/m1?source=src&audio=2";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(heldAudioPick(1, "m1")).toEqual(pick);
    window.location.hash = "#/next/item/m1";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(heldAudioPick(1, "m1")).toEqual(pick);
    window.location.hash = "#/next/home";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(heldAudioPick(1, "m1")).toBeUndefined();
  });

  it("forgets the pick when the next episode's player opens", () => {
    window.location.hash = "#/next/play/m1?source=src&audio=2";
    holdAudioPick(pick);
    window.location.hash = "#/next/play/m2";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(heldAudioPick(1, "m1")).toBeUndefined();
  });

  it("writes to no storage", () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    holdAudioPick(pick);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
