import type { RealtimeConnection } from "../domain/realtime";
import { JellyfinGateway } from "../lib/jellyfin/gateway";
import { BrowserPlayerEngine } from "../lib/player/browser-player";
import { NativeRealtime } from "../lib/realtime/native-realtime";
import { NoOpRealtime } from "../lib/realtime/no-op-realtime";
import type { PocServices } from "../poc/services";
import { isTauriRuntime, NativePlayerEngine } from "../lib/player/native-player";

export type AppServices = PocServices & {
  realtime: RealtimeConnection;
};

// Composition root: the only module that constructs the gateway, player
// engines, and the realtime connection.
export function createServices(): AppServices {
  const native = isTauriRuntime();
  return {
    native,
    createGateway: (serverUrl) => new JellyfinGateway(serverUrl),
    createPlayerEngine: () => (native ? new NativePlayerEngine() : new BrowserPlayerEngine()),
    realtime: native ? new NativeRealtime() : new NoOpRealtime(),
  };
}
