// Non-secret preferences for this computer (product review Q9 A: one set of
// settings per computer, not per account). Shell-neutral: this module holds
// the port, the record type, the defaults, validation, and an in-memory
// store. A shell that can persist supplies its own PreferenceStore.
//
// Rule for every field added here: it is a typed, validated value with a
// default, and it is never a token, credential, URL, play-session ID, user
// id, or anything derived from them (ARCHITECTURE.md I4).
import { DEFAULT_SKIP_MODES, SKIP_MODES, type SkipMode, type SkipModes } from "../domain/media-segments";
import { DEFAULT_CONTINUE_WINDOW, type ContinueWindow } from "../domain/up-next";
import {
  LimitListeners,
  NO_STREAMING_LIMITS,
  sanitizeLimits,
  type StreamingLimits,
  type StreamingLimitStore,
} from "./streaming-limits";

export const PREFERENCES_VERSION = 1;

export const COUNTDOWN_CHOICES_SECONDS = [5, 10, 15] as const;
export type CountdownSeconds = (typeof COUNTDOWN_CHOICES_SECONDS)[number];

// Auto-play next: whether the next episode starts by itself, and how long the
// Up next card counts down first.
export interface AutoPlayPreference {
  enabled: boolean;
  countdownSeconds: CountdownSeconds;
}

export const DEFAULT_AUTO_PLAY: AutoPlayPreference = Object.freeze({ enabled: true, countdownSeconds: 10 });

export interface PreferenceValues {
  streamingLimits: StreamingLimits;
  // How long a title stays in Home's Continue watching row after its last play.
  continueWindow: ContinueWindow;
  // What happens at an intro and at the credits.
  skipModes: SkipModes;
  autoPlay: AutoPlayPreference;
}

export const DEFAULT_PREFERENCES: PreferenceValues = Object.freeze({
  streamingLimits: NO_STREAMING_LIMITS,
  continueWindow: DEFAULT_CONTINUE_WINDOW,
  skipModes: DEFAULT_SKIP_MODES,
  autoPlay: DEFAULT_AUTO_PLAY,
});

const CONTINUE_WINDOWS: readonly ContinueWindow[] = ["7", "14", "30", "all"];

export function sanitizeContinueWindow(value: unknown): ContinueWindow {
  return CONTINUE_WINDOWS.find((option) => option === value) ?? DEFAULT_CONTINUE_WINDOW;
}

function sanitizeSkipMode(value: unknown): SkipMode {
  return SKIP_MODES.find((mode) => mode === value) ?? "button";
}

export function sanitizeSkipModes(value: unknown): SkipModes {
  if (typeof value !== "object" || value === null) return DEFAULT_SKIP_MODES;
  const record = value as Record<string, unknown>;
  return { intro: sanitizeSkipMode(record.intro), credits: sanitizeSkipMode(record.credits) };
}

// Each subfield falls back on its own; unknown subkeys are dropped.
export function sanitizeAutoPlay(value: unknown): AutoPlayPreference {
  if (typeof value !== "object" || value === null) return DEFAULT_AUTO_PLAY;
  const record = value as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_AUTO_PLAY.enabled,
    countdownSeconds:
      COUNTDOWN_CHOICES_SECONDS.find((seconds) => seconds === record.countdownSeconds) ?? DEFAULT_AUTO_PLAY.countdownSeconds,
  };
}

// Validates each known field on its own and falls back to its default.
// Unknown keys are dropped.
export function sanitizePreferences(value: unknown): PreferenceValues {
  if (typeof value !== "object" || value === null) return DEFAULT_PREFERENCES;
  const record = value as Record<string, unknown>;
  return {
    streamingLimits: sanitizeLimits(record.streamingLimits),
    continueWindow: sanitizeContinueWindow(record.continueWindow),
    skipModes: sanitizeSkipModes(record.skipModes),
    autoPlay: sanitizeAutoPlay(record.autoPlay),
  };
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

export interface ContinueWindowStore {
  get(): ContinueWindow;
  set(window: ContinueWindow): void;
  subscribe(listener: () => void): () => void;
}

// The Continue watching window view of a preference store.
export function continueWindowOf(store: PreferenceStore): ContinueWindowStore {
  return {
    get: () => store.get().continueWindow,
    set: (window) => store.update("continueWindow", sanitizeContinueWindow(window)),
    subscribe: (listener) => store.subscribe(listener),
  };
}

export interface SkipModeStore {
  get(): SkipModes;
  set(kind: keyof SkipModes, mode: SkipMode): void;
  subscribe(listener: () => void): () => void;
}

// The skip modes view of a preference store.
export function skipModesOf(store: PreferenceStore): SkipModeStore {
  // A browser store parses storage on every read; a stable object keeps useSyncExternalStore from looping.
  let last = store.get().skipModes;
  return {
    get: () => {
      const next = store.get().skipModes;
      if (next.intro !== last.intro || next.credits !== last.credits) last = next;
      return last;
    },
    set: (kind, mode) => store.update("skipModes", sanitizeSkipModes({ ...store.get().skipModes, [kind]: mode })),
    subscribe: (listener) => store.subscribe(listener),
  };
}

export interface AutoPlayStore {
  get(): AutoPlayPreference;
  set(value: AutoPlayPreference): void;
  subscribe(listener: () => void): () => void;
}

// The auto-play view of a preference store.
export function autoPlayOf(store: PreferenceStore): AutoPlayStore {
  // A browser store parses storage on every read; a stable object keeps useSyncExternalStore from looping.
  let last = store.get().autoPlay;
  return {
    get: () => {
      const next = store.get().autoPlay;
      if (next.enabled !== last.enabled || next.countdownSeconds !== last.countdownSeconds) last = next;
      return last;
    },
    set: (value) => store.update("autoPlay", sanitizeAutoPlay(value)),
    subscribe: (listener) => store.subscribe(listener),
  };
}
