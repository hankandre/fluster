import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserPreferenceStore,
  LEGACY_STREAMING_LIMITS_STORAGE_KEY as LEGACY,
  PREFERENCES_STORAGE_KEY as KEY,
  preferences,
  streamingLimits,
} from "./browser-preference-store";
import { autoPlayOf, skipModesOf, streamingLimitsOf } from "./preference-store";

const CANARY = "CANARY-7f3a9c1e5b";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function limitsOf(store: BrowserPreferenceStore) {
  return streamingLimitsOf(store);
}

describe("browser preference store", () => {
  it("defaults to no limit", () => {
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({});
  });

  it("stores only allowlisted fields and never a token", () => {
    const store = new BrowserPreferenceStore();
    store.update("streamingLimits", { localMbps: 40, remoteMbps: 8, token: CANARY } as never);
    store.update("accessToken" as never, CANARY as never);
    const raw = window.localStorage.getItem(KEY)!;
    expect(raw).not.toContain(CANARY);
    expect(JSON.parse(raw)).toEqual({ version: 1, streamingLimits: { localMbps: 40, remoteMbps: 8 }, continueWindow: "14", skipModes: { intro: "button", credits: "button" }, autoPlay: { enabled: true, countdownSeconds: 10 } });
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({ localMbps: 40, remoteMbps: 8 });
  });

  it("clears a limit back to no limit", () => {
    const limits = limitsOf(new BrowserPreferenceStore());
    limits.set({ remoteMbps: 8 });
    limits.set({});
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({});
  });

  it.each([
    "not json",
    "null",
    "[1,2]",
    JSON.stringify({ streamingLimits: { localMbps: 20 } }),
    JSON.stringify({ version: 2, streamingLimits: { localMbps: 20 } }),
  ])("ignores corrupt or foreign stored data: %s", (raw) => {
    window.localStorage.setItem(KEY, raw);
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({});
  });

  it("drops an out-of-list value from a valid record", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, streamingLimits: { localMbps: 7, remoteMbps: 4 } }));
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({ remoteMbps: 4 });
  });

  it("holds the choice in memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const limits = limitsOf(new BrowserPreferenceStore());
    limits.set({ remoteMbps: 10 });
    expect(limits.get()).toEqual({ remoteMbps: 10 });
  });

  it("tells subscribers after a change, once get() returns it", () => {
    const limits = limitsOf(new BrowserPreferenceStore());
    const seen: unknown[] = [];
    const unsubscribe = limits.subscribe(() => seen.push(limits.get()));
    limits.set({ localMbps: 20 });
    unsubscribe();
    limits.set({ localMbps: 8 });
    expect(seen).toEqual([{ localMbps: 20 }]);
  });

  it("shares one record between the singletons", () => {
    streamingLimits.set({ localMbps: 10 });
    expect(preferences.get().streamingLimits).toEqual({ localMbps: 10 });
  });
});

describe("migrating the streaming limits", () => {
  it("keeps the stored values, writes the new record, and removes the legacy key", () => {
    window.localStorage.setItem(LEGACY, JSON.stringify({ version: 1, localMbps: 40, remoteMbps: 8 }));
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({ localMbps: 40, remoteMbps: 8 });
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({
      version: 1,
      streamingLimits: { localMbps: 40, remoteMbps: 8 },
      continueWindow: "14",
      skipModes: { intro: "button", credits: "button" },
      autoPlay: { enabled: true, countdownSeconds: 10 },
    });
    expect(window.localStorage.getItem(LEGACY)).toBeNull();
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({ localMbps: 40, remoteMbps: 8 });
  });

  it.each([
    "not json",
    JSON.stringify({ localMbps: 20 }),
    JSON.stringify({ version: 2, localMbps: 20 }),
  ])("migrates a corrupt or foreign legacy record as no limit: %s", (raw) => {
    window.localStorage.setItem(LEGACY, raw);
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({});
    expect(window.localStorage.getItem(LEGACY)).toBeNull();
  });

  it("lets a valid new record win and removes the legacy key", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, streamingLimits: { remoteMbps: 2 } }));
    window.localStorage.setItem(LEGACY, JSON.stringify({ version: 1, localMbps: 40 }));
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({ remoteMbps: 2 });
    expect(window.localStorage.getItem(LEGACY)).toBeNull();
  });

  it("removes the legacy key even when the new record is corrupt", () => {
    window.localStorage.setItem(KEY, "not json");
    window.localStorage.setItem(LEGACY, JSON.stringify({ version: 1, localMbps: 40 }));
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({});
    expect(window.localStorage.getItem(LEGACY)).toBeNull();
  });

  it("returns the values and keeps the legacy key when the write fails", () => {
    window.localStorage.setItem(LEGACY, JSON.stringify({ version: 1, localMbps: 40 }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(limitsOf(new BrowserPreferenceStore()).get()).toEqual({ localMbps: 40 });
    expect(window.localStorage.getItem(LEGACY)).not.toBeNull();
  });

  it("stores the Continue watching window and reads it back; an invalid stored value reads as 14 days", () => {
    const store = new BrowserPreferenceStore();
    store.update("continueWindow", "7");
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toMatchObject({ version: 1, continueWindow: "7" });
    expect(new BrowserPreferenceStore().get().continueWindow).toBe("7");
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, continueWindow: "99" }));
    expect(new BrowserPreferenceStore().get().continueWindow).toBe("14");
  });

  it("stores the skip modes, and a record written before them reads its other fields unchanged", () => {
    const store = new BrowserPreferenceStore();
    store.update("skipModes", { intro: "auto", credits: "none" });
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toMatchObject({ version: 1, skipModes: { intro: "auto", credits: "none" } });
    expect(new BrowserPreferenceStore().get().skipModes).toEqual({ intro: "auto", credits: "none" });
    // A read that parses storage again still gives the same object, as useSyncExternalStore needs.
    const view = skipModesOf(store);
    expect(view.get()).toBe(view.get());
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, streamingLimits: { localMbps: 20 }, continueWindow: "30" }));
    expect(new BrowserPreferenceStore().get()).toEqual({
      streamingLimits: { localMbps: 20 },
      continueWindow: "30",
      skipModes: { intro: "button", credits: "button" },
      autoPlay: { enabled: true, countdownSeconds: 10 },
    });
  });

  it("stores auto-play, reads it back, drops unknown subkeys, and reads a record without it as the default", () => {
    const store = new BrowserPreferenceStore();
    store.update("autoPlay", { enabled: false, countdownSeconds: 5, token: CANARY } as never);
    const raw = window.localStorage.getItem(KEY)!;
    expect(raw).not.toContain(CANARY);
    expect(JSON.parse(raw).autoPlay).toEqual({ enabled: false, countdownSeconds: 5 });
    expect(new BrowserPreferenceStore().get().autoPlay).toEqual({ enabled: false, countdownSeconds: 5 });
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, continueWindow: "7" }));
    expect(new BrowserPreferenceStore().get().autoPlay).toEqual({ enabled: true, countdownSeconds: 10 });
  });

  it("keeps two fields changed in a row when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = new BrowserPreferenceStore();
    store.update("autoPlay", { enabled: false, countdownSeconds: 15 });
    store.update("continueWindow", "7");
    expect(store.get().autoPlay).toEqual({ enabled: false, countdownSeconds: 15 });
    expect(store.get().continueWindow).toBe("7");
  });

  it("stores skip modes and auto-play together, and a record with one invalid keeps the other", () => {
    const store = new BrowserPreferenceStore();
    store.update("skipModes", { intro: "auto", credits: "none" });
    store.update("autoPlay", { enabled: false, countdownSeconds: 5 });
    const read = new BrowserPreferenceStore().get();
    expect(read.skipModes).toEqual({ intro: "auto", credits: "none" });
    expect(read.autoPlay).toEqual({ enabled: false, countdownSeconds: 5 });
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, skipModes: "bogus", autoPlay: { enabled: false, countdownSeconds: 15 } }));
    expect(new BrowserPreferenceStore().get()).toMatchObject({ skipModes: { intro: "button", credits: "button" }, autoPlay: { enabled: false, countdownSeconds: 15 } });
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, skipModes: { intro: "auto", credits: "auto" }, autoPlay: 3 }));
    expect(new BrowserPreferenceStore().get()).toMatchObject({ skipModes: { intro: "auto", credits: "auto" }, autoPlay: { enabled: true, countdownSeconds: 10 } });
  });

  it("gives the auto-play view a stable snapshot while the values are unchanged", () => {
    const view = autoPlayOf(new BrowserPreferenceStore());
    expect(view.get()).toBe(view.get());
    const before = view.get();
    view.set({ enabled: false, countdownSeconds: 10 });
    expect(view.get()).not.toBe(before);
    expect(view.get()).toBe(view.get());
  });
});
