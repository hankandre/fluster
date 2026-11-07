import type { PlayerEngine } from "../domain/playback";
import type { JellyfinGateway } from "../lib/jellyfin/gateway";

// What the frozen proof of concept needs from the composition root (src/app/compose.ts).
export type PocServices = {
  native: boolean;
  createGateway(serverUrl: string): JellyfinGateway;
  createPlayerEngine(): PlayerEngine;
};
