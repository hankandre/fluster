import { describe, expect, it } from "vitest";
import {
  autoPlayOf,
  continueWindowOf,
  skipModesOf,
  DEFAULT_PREFERENCES,
  MemoryPreferenceStore,
  parseStoredPreferences,
  sanitizeAutoPlay,
  sanitizePreferences,
  streamingLimitsOf,
} from "./preference-store";

describe("preference store", () => {
  it("starts at the defaults", () => {
    expect(new MemoryPreferenceStore().get()).toEqual(DEFAULT_PREFERENCES);
  });

  it("sanitizes each field on its own and drops unknown keys", () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences(5)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences([])).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ streamingLimits: 5 })).toEqual({ streamingLimits: {}, continueWindow: "14", skipModes: { intro: "button", credits: "button" }, autoPlay: { enabled: true, countdownSeconds: 10 } });
    expect(sanitizePreferences({ streamingLimits: { localMbps: 7, remoteMbps: 4 } })).toEqual({
      streamingLimits: { remoteMbps: 4 },
      continueWindow: "14",
      skipModes: { intro: "button", credits: "button" },
      autoPlay: { enabled: true, countdownSeconds: 10 },
    });
    expect(sanitizePreferences({ streamingLimits: {}, other: 1 })).toEqual({ streamingLimits: {}, continueWindow: "14", skipModes: { intro: "button", credits: "button" }, autoPlay: { enabled: true, countdownSeconds: 10 } });
  });

  it("reads a stored record only at version 1", () => {
    const limits = { localMbps: 20 };
    expect(parseStoredPreferences({ streamingLimits: limits })).toEqual(DEFAULT_PREFERENCES);
    expect(parseStoredPreferences({ version: 2, streamingLimits: limits })).toEqual(DEFAULT_PREFERENCES);
    expect(parseStoredPreferences({ version: "1", streamingLimits: limits })).toEqual(DEFAULT_PREFERENCES);
    expect(parseStoredPreferences({ version: 1, streamingLimits: limits })).toEqual({ streamingLimits: limits, continueWindow: "14", skipModes: { intro: "button", credits: "button" }, autoPlay: { enabled: true, countdownSeconds: 10 } });
  });

  it("notifies once after an update, once get() returns it, until unsubscribed", () => {
    const store = new MemoryPreferenceStore();
    const seen: unknown[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.get().streamingLimits));
    store.update("streamingLimits", { localMbps: 20 });
    unsubscribe();
    store.update("streamingLimits", { localMbps: 8 });
    expect(seen).toEqual([{ localMbps: 20 }]);
  });

  it("gives the streaming limits as a store of their own", () => {
    const store = new MemoryPreferenceStore();
    const limits = streamingLimitsOf(store);
    const seen: unknown[] = [];
    limits.subscribe(() => seen.push(limits.get()));
    limits.set({ localMbps: 40, remoteMbps: 7 });
    expect(limits.get()).toEqual({ localMbps: 40 });
    expect(store.get().streamingLimits).toEqual({ localMbps: 40 });
    expect(seen).toEqual([{ localMbps: 40 }]);
  });

  it("defaults the Continue watching window to 14 days and falls back from an invalid value", () => {
    expect(DEFAULT_PREFERENCES.continueWindow).toBe("14");
    for (const bad of [14, "15", "", null, {}, "ALL"]) expect(sanitizePreferences({ continueWindow: bad }).continueWindow).toBe("14");
    for (const good of ["7", "14", "30", "all"] as const) expect(sanitizePreferences({ continueWindow: good }).continueWindow).toBe(good);
  });

  it("gives the Continue watching window as a store of its own", () => {
    const store = new MemoryPreferenceStore();
    const window = continueWindowOf(store);
    const seen: unknown[] = [];
    window.subscribe(() => seen.push(window.get()));
    window.set("30");
    window.set("nope" as never);
    expect(store.get().continueWindow).toBe("14");
    expect(seen).toEqual(["30", "14"]);
  });

  it("defaults both skip modes to a button and reads each field on its own", () => {
    expect(DEFAULT_PREFERENCES.skipModes).toEqual({ intro: "button", credits: "button" });
    expect(sanitizePreferences({ skipModes: { intro: "auto", credits: 7 } }).skipModes).toEqual({ intro: "auto", credits: "button" });
    expect(sanitizePreferences({ skipModes: { intro: "AUTO", credits: "none" } }).skipModes).toEqual({ intro: "button", credits: "none" });
    expect(sanitizePreferences({ skipModes: "auto" }).skipModes).toEqual({ intro: "button", credits: "button" });
    expect(sanitizePreferences({ continueWindow: "7" })).toMatchObject({ continueWindow: "7", skipModes: { intro: "button", credits: "button" }, autoPlay: { enabled: true, countdownSeconds: 10 } });
  });

  it("gives the skip modes as a store that writes one kind and keeps the other", () => {
    const store = new MemoryPreferenceStore();
    const modes = skipModesOf(store);
    const seen: unknown[] = [];
    modes.subscribe(() => seen.push(modes.get()));
    modes.set("intro", "auto");
    modes.set("credits", "none");
    modes.set("intro", "nope" as never);
    expect(modes.get()).toBe(modes.get());
    expect(store.get().skipModes).toEqual({ intro: "button", credits: "none" });
    expect(seen).toEqual([
      { intro: "auto", credits: "button" },
      { intro: "auto", credits: "none" },
      { intro: "button", credits: "none" },
    ]);
  });

  it("defaults auto-play to on with a 10 second countdown and validates each subfield on its own", () => {
    expect(DEFAULT_PREFERENCES.autoPlay).toEqual({ enabled: true, countdownSeconds: 10 });
    for (const bad of [null, 5, "x", [], {}]) expect(sanitizeAutoPlay(bad)).toEqual({ enabled: true, countdownSeconds: 10 });
    for (const bad of ["yes", 1, 0, null]) expect(sanitizeAutoPlay({ enabled: bad }).enabled).toBe(true);
    for (const bad of [7, "10", null, 0, 20]) expect(sanitizeAutoPlay({ countdownSeconds: bad }).countdownSeconds).toBe(10);
    expect(sanitizeAutoPlay({ enabled: false, countdownSeconds: 7 })).toEqual({ enabled: false, countdownSeconds: 10 });
    expect(sanitizeAutoPlay({ enabled: "no", countdownSeconds: 15 })).toEqual({ enabled: true, countdownSeconds: 15 });
    expect(sanitizeAutoPlay({ enabled: false, countdownSeconds: 15, extra: 1 })).toEqual({ enabled: false, countdownSeconds: 15 });
  });

  it("gives auto-play as a store of its own and keeps the other fields", () => {
    const store = new MemoryPreferenceStore();
    store.update("streamingLimits", { localMbps: 20 });
    store.update("continueWindow", "7");
    const autoPlay = autoPlayOf(store);
    const seen: unknown[] = [];
    autoPlay.subscribe(() => seen.push(autoPlay.get()));
    autoPlay.set({ enabled: false, countdownSeconds: 5 });
    autoPlay.set({ enabled: true, countdownSeconds: 7 } as never);
    expect(store.get().streamingLimits).toEqual({ localMbps: 20 });
    expect(store.get().continueWindow).toBe("7");
    expect(seen).toEqual([{ enabled: false, countdownSeconds: 5 }, { enabled: true, countdownSeconds: 10 }]);
  });

  it("keeps skip modes and auto-play side by side, and a bad value in one never resets the other", () => {
    const both = { skipModes: { intro: "auto", credits: "none" }, autoPlay: { enabled: false, countdownSeconds: 5 } };
    expect(sanitizePreferences(both)).toMatchObject(both);
    expect(sanitizePreferences({ ...both, skipModes: 7 })).toMatchObject({
      skipModes: { intro: "button", credits: "button" },
      autoPlay: { enabled: false, countdownSeconds: 5 },
    });
    expect(sanitizePreferences({ ...both, autoPlay: "no" })).toMatchObject({
      skipModes: { intro: "auto", credits: "none" },
      autoPlay: { enabled: true, countdownSeconds: 10 },
    });
    const store = new MemoryPreferenceStore();
    skipModesOf(store).set("credits", "auto");
    autoPlayOf(store).set({ enabled: false, countdownSeconds: 15 });
    expect(store.get()).toMatchObject({ skipModes: { intro: "button", credits: "auto" }, autoPlay: { enabled: false, countdownSeconds: 15 } });
  });
});
