// Browser-storage adapter for the preferences store. The record is rebuilt
// from the allowlist on every write, so it never holds a token or anything
// derived from one.
import {
  MemoryPreferenceStore,
  parseStoredPreferences,
  storedPreferences,
  streamingLimitsOf,
  type PreferenceStore,
  type PreferenceValues,
} from "./preference-store";
import { LimitListeners, sanitizeLimits, type StreamingLimits } from "./streaming-limits";

export const PREFERENCES_STORAGE_KEY = "fluster.preferences";
export const LEGACY_STREAMING_LIMITS_STORAGE_KEY = "fluster.streamingLimits";

// The older record: { version: 1, localMbps?, remoteMbps? }.
function legacyLimits(raw: string): StreamingLimits {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || (parsed as { version?: unknown }).version !== 1) return {};
    return sanitizeLimits(parsed);
  } catch {
    return {};
  }
}

export class BrowserPreferenceStore implements PreferenceStore {
  // Holds the value when storage is blocked, so a choice lasts for this launch.
  private readonly memory = new MemoryPreferenceStore();
  private readonly listeners = new LimitListeners();

  get(): PreferenceValues {
    try {
      return this.read();
    } catch {
      return this.memory.get();
    }
  }

  private read(): PreferenceValues {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw === null) return this.migrate();
    // The new record wins; drop a leftover legacy record before parsing.
    this.removeLegacy();
    return parseStoredPreferences(JSON.parse(raw));
  }

  private migrate(): PreferenceValues {
    const legacy = window.localStorage.getItem(LEGACY_STREAMING_LIMITS_STORAGE_KEY);
    if (legacy === null) return this.memory.get();
    this.memory.update("streamingLimits", legacyLimits(legacy));
    const values = this.memory.get();
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(storedPreferences(values)));
      window.localStorage.removeItem(LEGACY_STREAMING_LIMITS_STORAGE_KEY);
    } catch {
      // Keep the legacy record if the new one could not be written.
    }
    return values;
  }

  private removeLegacy(): void {
    try {
      if (window.localStorage.getItem(LEGACY_STREAMING_LIMITS_STORAGE_KEY) !== null) {
        window.localStorage.removeItem(LEGACY_STREAMING_LIMITS_STORAGE_KEY);
      }
    } catch {
      // Best effort.
    }
  }

  update<K extends keyof PreferenceValues>(key: K, value: PreferenceValues[K]): void {
    // Read first so fields this call does not change are kept.
    const current = this.get();
    this.memory.update(key, value);
    const next = { ...current, [key]: this.memory.get()[key] };
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(storedPreferences(next)));
    } catch {
      // Keep the in-memory value only.
    }
    this.listeners.notify();
  }

  subscribe(listener: () => void): () => void {
    return this.listeners.add(listener);
  }
}

// One store per app launch, so the in-memory fallback outlives a gateway.
export const preferences = new BrowserPreferenceStore();
export const streamingLimits = streamingLimitsOf(preferences);
