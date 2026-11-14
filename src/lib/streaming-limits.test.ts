import { describe, expect, it } from "vitest";
import type { PlaybackPlan } from "../domain/playback";
import { limitChangeAffects, limitMbpsFor, MemoryStreamingLimits, sanitizeLimits } from "./streaming-limits";

describe("streaming limits", () => {
  it("default to no limit for both", () => {
    expect(new MemoryStreamingLimits().get()).toEqual({});
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

  it("tells subscribers after a change, once get() returns it", () => {
    const store = new MemoryStreamingLimits();
    const seen: unknown[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.get()));
    store.set({ localMbps: 20 });
    unsubscribe();
    store.set({ localMbps: 8 });
    expect(seen).toEqual([{ localMbps: 20 }]);
  });

  it("says a limit change affects a conversion always and the original file only below its bitrate", () => {
    const direct = { delivery: "static", sourceBitrate: 30_000_000 } as PlaybackPlan;
    expect(limitChangeAffects(direct, 20_000_000)).toBe(true);
    expect(limitChangeAffects(direct, 40_000_000)).toBe(false);
    expect(limitChangeAffects(direct, undefined)).toBe(false);
    expect(limitChangeAffects({ delivery: "static" } as PlaybackPlan, 2_000_000)).toBe(false);
    expect(limitChangeAffects({ delivery: "hls" } as PlaybackPlan, undefined)).toBe(true);
  });
});
