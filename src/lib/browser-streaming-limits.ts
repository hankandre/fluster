// Browser-storage adapter for the streaming limits. The record holds two
// bitrates and nothing else; it is never derived from a token.
import { MemoryStreamingLimits, sanitizeLimits, type StreamingLimits, type StreamingLimitStore } from "./streaming-limits";

export const STREAMING_LIMITS_STORAGE_KEY = "fluster.streamingLimits";
const VERSION = 1;

export class BrowserStreamingLimits implements StreamingLimitStore {
  // Holds the value when storage is blocked, so a choice lasts for this launch.
  private readonly memory = new MemoryStreamingLimits();

  get(): StreamingLimits {
    try {
      const raw = window.localStorage.getItem(STREAMING_LIMITS_STORAGE_KEY);
      if (!raw) return this.memory.get();
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || (parsed as { version?: unknown }).version !== VERSION) {
        return this.memory.get();
      }
      return sanitizeLimits(parsed);
    } catch {
      return this.memory.get();
    }
  }

  set(limits: StreamingLimits): void {
    this.memory.set(limits);
    const clean = this.memory.get();
    try {
      window.localStorage.setItem(STREAMING_LIMITS_STORAGE_KEY, JSON.stringify({ version: VERSION, ...clean }));
    } catch {
      // Keep the in-memory value only.
    }
  }
}

// One store per app launch, so the in-memory fallback outlives a gateway.
export const streamingLimits = new BrowserStreamingLimits();
