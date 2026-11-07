import { createContext, useContext, type ReactNode } from "react";
import type { PlayerEngine } from "../domain/playback";

// What the player feature receives from the composition root. Features never
// construct engines; they get the app's one engine through this context.
export interface PlayerServices {
  engine: PlayerEngine;
  // Runs `beforeClose` when the user closes the app window, then closes it.
  // Returns a function that stops watching. Undefined outside the desktop app.
  watchWindowClose?: (beforeClose: () => Promise<void>) => () => void;
}

const PlayerServicesContext = createContext<PlayerServices | undefined>(undefined);

export function PlayerServicesProvider({ services, children }: { services: PlayerServices; children: ReactNode }) {
  return <PlayerServicesContext.Provider value={services}>{children}</PlayerServicesContext.Provider>;
}

export function usePlayerServices(): PlayerServices {
  const services = useContext(PlayerServicesContext);
  if (!services) throw new Error("usePlayerServices must be used inside PlayerServicesProvider.");
  return services;
}
