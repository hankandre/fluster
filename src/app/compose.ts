import { JellyfinGateway } from "../lib/jellyfin/gateway";
import { BrowserPlayerEngine } from "../lib/player/browser-player";
import type { PocServices } from "../poc/services";
import { isTauriRuntime, NativePlayerEngine } from "../lib/player/native-player";

// Composition root: the only module that constructs the gateway and player engines.
export function createServices(): PocServices {
  const native = isTauriRuntime();
  return {
    native,
    createGateway: (serverUrl) => new JellyfinGateway(serverUrl),
    createPlayerEngine: () => (native ? new NativePlayerEngine() : new BrowserPlayerEngine()),
  };
}
