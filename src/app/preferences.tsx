import { createContext, useContext, type ReactNode } from "react";
import type { StreamingLimitStore } from "../lib/streaming-limits";

// Non-secret user preferences the composition root hands to features.
export interface Preferences {
  streamingLimits: StreamingLimitStore;
}

const PreferencesContext = createContext<Preferences | undefined>(undefined);

export function PreferencesProvider({ preferences, children }: { preferences: Preferences; children: ReactNode }) {
  return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error("usePreferences must be used inside PreferencesProvider.");
  return preferences;
}

// For views that only follow a preference and still work without one, such
// as the player watching the streaming limit.
export function useOptionalPreferences(): Preferences | undefined {
  return useContext(PreferencesContext);
}
