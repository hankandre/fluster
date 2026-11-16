import { describe, expect, it } from "vitest";
import {
  continueWindowOf,
  DEFAULT_PREFERENCES,
  MemoryPreferenceStore,
  parseStoredPreferences,
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
    expect(sanitizePreferences({ streamingLimits: 5 })).toEqual({ streamingLimits: {}, continueWindow: "14" });
    expect(sanitizePreferences({ streamingLimits: { localMbps: 7, remoteMbps: 4 } })).toEqual({
      streamingLimits: { remoteMbps: 4 },
      continueWindow: "14",
    });
    expect(sanitizePreferences({ streamingLimits: {}, other: 1 })).toEqual({ streamingLimits: {}, continueWindow: "14" });
  });

  it("reads a stored record only at version 1", () => {
    const limits = { localMbps: 20 };
    expect(parseStoredPreferences({ streamingLimits: limits })).toEqual(DEFAULT_PREFERENCES);
    expect(parseStoredPreferences({ version: 2, streamingLimits: limits })).toEqual(DEFAULT_PREFERENCES);
    expect(parseStoredPreferences({ version: "1", streamingLimits: limits })).toEqual(DEFAULT_PREFERENCES);
    expect(parseStoredPreferences({ version: 1, streamingLimits: limits })).toEqual({ streamingLimits: limits, continueWindow: "14" });
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
});
