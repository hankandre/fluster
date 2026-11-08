import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserStreamingLimits, STREAMING_LIMITS_STORAGE_KEY } from "./browser-streaming-limits";
import { limitMbpsFor, MemoryStreamingLimits, sanitizeLimits } from "./streaming-limits";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("streaming limits", () => {
  it("default to no limit for both", () => {
    expect(new MemoryStreamingLimits().get()).toEqual({});
    expect(new BrowserStreamingLimits().get()).toEqual({});
  });

  it("picks local for loopback and private-lan and remote for public", () => {
    const limits = { localMbps: 20, remoteMbps: 4 };
    expect(limitMbpsFor("loopback", limits)).toBe(20);
    expect(limitMbpsFor("private-lan", limits)).toBe(20);
    expect(limitMbpsFor("public", limits)).toBe(4);
    expect(limitMbpsFor("public", {})).toBeUndefined();
  });

  it("keeps only offered values", () => {
    expect(sanitizeLimits({ localMbps: 7, remoteMbps: "20" })).toEqual({});
    expect(sanitizeLimits({ localMbps: 120, remoteMbps: 2 })).toEqual({ localMbps: 120, remoteMbps: 2 });
    expect(sanitizeLimits(null)).toEqual({});
    expect(sanitizeLimits(5)).toEqual({});
  });

  it("persists a versioned record of two numbers and nothing else", () => {
    new BrowserStreamingLimits().set({ localMbps: 40, remoteMbps: 8, token: "secret" } as never);
    expect(JSON.parse(window.localStorage.getItem(STREAMING_LIMITS_STORAGE_KEY)!)).toEqual({
      version: 1,
      localMbps: 40,
      remoteMbps: 8,
    });
    expect(new BrowserStreamingLimits().get()).toEqual({ localMbps: 40, remoteMbps: 8 });
  });

  it("clears a limit back to no limit", () => {
    const store = new BrowserStreamingLimits();
    store.set({ remoteMbps: 8 });
    store.set({});
    expect(new BrowserStreamingLimits().get()).toEqual({});
  });

  it.each([
    "not json",
    "null",
    "[1,2]",
    JSON.stringify({ localMbps: 20 }),
    JSON.stringify({ version: 2, localMbps: 20 }),
  ])("ignores corrupt or foreign stored data: %s", (raw) => {
    window.localStorage.setItem(STREAMING_LIMITS_STORAGE_KEY, raw);
    expect(new BrowserStreamingLimits().get()).toEqual({});
  });

  it("drops an out-of-list value from a valid record", () => {
    window.localStorage.setItem(STREAMING_LIMITS_STORAGE_KEY, JSON.stringify({ version: 1, localMbps: 7, remoteMbps: 4 }));
    expect(new BrowserStreamingLimits().get()).toEqual({ remoteMbps: 4 });
  });

  it("holds the choice in memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = new BrowserStreamingLimits();
    store.set({ remoteMbps: 10 });
    expect(store.get()).toEqual({ remoteMbps: 10 });
  });
});
