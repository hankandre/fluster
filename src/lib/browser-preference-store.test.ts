import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserPreferenceStore,
  LEGACY_STREAMING_LIMITS_STORAGE_KEY as LEGACY,
  PREFERENCES_STORAGE_KEY as KEY,
  preferences,
  streamingLimits,
} from "./browser-preference-store";
import { streamingLimitsOf } from "./preference-store";

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
    expect(JSON.parse(raw)).toEqual({ version: 1, streamingLimits: { localMbps: 40, remoteMbps: 8 } });
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
});
