import type { RealtimeConnection } from "../domain/realtime";
import type { PlayerServices } from "./player-services";
import { JellyfinGateway } from "../lib/jellyfin/gateway";
import { BrowserPlayerEngine } from "../lib/player/browser-player";
import { NativeRealtime } from "../lib/realtime/native-realtime";
import { NoOpRealtime } from "../lib/realtime/no-op-realtime";
import type { PocServices } from "../poc/services";
import { isTauriRuntime, NativePlayerEngine } from "../lib/player/native-player";
import { watchNativeMediaControls } from "./media-controls";
import { watchNativeWindowClose } from "./window-close";

export type AppServices = PocServices & {
  realtime: RealtimeConnection;
  // Lets playback stop and report before the desktop window closes.
  watchWindowClose?: (beforeClose: () => Promise<void>) => () => void;
  // Lets the system media controls stop playback like Back.
  watchMediaControls?: PlayerServices["watchMediaControls"];
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
    watchWindowClose: native ? watchNativeWindowClose : undefined,
    watchMediaControls: native ? watchNativeMediaControls : undefined,
  };
}
