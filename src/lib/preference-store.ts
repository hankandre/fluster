// Non-secret preferences for this computer (product review Q9 A: one set of
// settings per computer, not per account). Shell-neutral: this module holds
// the port, the record type, the defaults, validation, and an in-memory
// store. A shell that can persist supplies its own PreferenceStore.
//
// Rule for every field added here: it is a typed, validated value with a
// default, and it is never a token, credential, URL, play-session ID, user
// id, or anything derived from them (ARCHITECTURE.md I4).
import {
  LimitListeners,
  NO_STREAMING_LIMITS,
  sanitizeLimits,
  type StreamingLimits,
  type StreamingLimitStore,
} from "./streaming-limits";

export const PREFERENCES_VERSION = 1;

export interface PreferenceValues {
  streamingLimits: StreamingLimits;
}

export const DEFAULT_PREFERENCES: PreferenceValues = Object.freeze({
  streamingLimits: NO_STREAMING_LIMITS,
});

// Validates each known field on its own and falls back to its default.
// Unknown keys are dropped.
export function sanitizePreferences(value: unknown): PreferenceValues {
  if (typeof value !== "object" || value === null) return DEFAULT_PREFERENCES;
  const record = value as Record<string, unknown>;
  return { streamingLimits: sanitizeLimits(record.streamingLimits) };
}

// For adapters reading a stored record: a version 1 object is sanitized;
// anything else reads as the defaults.
export function parseStoredPreferences(value: unknown): PreferenceValues {
  if (typeof value !== "object" || value === null) return DEFAULT_PREFERENCES;
  if ((value as { version?: unknown }).version !== PREFERENCES_VERSION) return DEFAULT_PREFERENCES;
  return sanitizePreferences(value);
}

// The only shape an adapter writes.
export function storedPreferences(values: PreferenceValues): { version: number } & PreferenceValues {
  return { version: PREFERENCES_VERSION, ...sanitizePreferences(values) };
}

export interface PreferenceStore {
  get(): PreferenceValues;
  update<K extends keyof PreferenceValues>(key: K, value: PreferenceValues[K]): void;
  // Calls the listener after every update, once get() returns the new value.
  // Returns the unsubscribe function.
  subscribe(listener: () => void): () => void;
}

export class MemoryPreferenceStore implements PreferenceStore {
  private values: PreferenceValues;
  private readonly listeners = new LimitListeners();

  constructor(initial: PreferenceValues = DEFAULT_PREFERENCES) {
    this.values = sanitizePreferences(initial);
  }

  get(): PreferenceValues {
    return this.values;
  }

  update<K extends keyof PreferenceValues>(key: K, value: PreferenceValues[K]): void {
    this.values = sanitizePreferences({ ...this.values, [key]: value });
    this.listeners.notify();
  }

  subscribe(listener: () => void): () => void {
    return this.listeners.add(listener);
  }
}

// The streaming-limit view of a preference store. A listener also runs on a
// change to another preference; the only subscriber today (checkLimit in
// use-playback-session.ts) returns early when this server's limit is
// unchanged, so a future subscriber must compare values itself.
export function streamingLimitsOf(store: PreferenceStore): StreamingLimitStore {
  return {
    get: () => store.get().streamingLimits,
    set: (limits) => store.update("streamingLimits", sanitizeLimits(limits)),
    subscribe: (listener) => store.subscribe(listener),
  };
}
