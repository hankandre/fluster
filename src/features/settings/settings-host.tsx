import { createContext, useContext, type ReactNode } from "react";
import { useOptionalToast } from "../shared/ui";

// Where a Settings section is shown. The page confirms a change with a toast; the player's sheet marks the
// changed row `row` (its label) with `word` beside its control, because toasts are dropped on the player route.
// `signOut` replaces the account section's own sign-out (the player stops playback first).
export interface SettingsHost {
  place: "page" | "player";
  confirm(message: string, row: string, word?: string): void;
  signOut?(): void;
}

const HostContext = createContext<SettingsHost | undefined>(undefined);

export function SettingsHostProvider({ host, children }: { host: SettingsHost; children: ReactNode }) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

// Without a provider: the page host.
export function useSettingsHost(): SettingsHost {
  const host = useContext(HostContext);
  const toast = useOptionalToast();
  if (host) return host;
  return { place: "page", confirm: (message) => toast?.show({ tone: "ok", message }) };
}
