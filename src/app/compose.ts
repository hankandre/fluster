import type { RealtimeConnection } from "../domain/realtime";
import type { ServerDiscovery } from "../domain/server-discovery";
import type { PlayerServices } from "./player-services";
import { lanHttpConfirmations } from "../lib/browser-lan-http-confirmations";
import { streamingLimits } from "../lib/browser-streaming-limits";
import type { StreamingLimitStore } from "../lib/streaming-limits";
import { getInstallId } from "../lib/install-id";
import { JellyfinGateway } from "../lib/jellyfin/gateway";
import { BrowserPlayerEngine } from "../lib/player/browser-player";
import { NativeRealtime } from "../lib/realtime/native-realtime";
import { NoOpRealtime } from "../lib/realtime/no-op-realtime";
import { NativeServerDiscovery } from "../lib/discovery/native-discovery";
import type { PlayerEngine } from "../domain/playback";
import { isTauriRuntime, NativePlayerEngine } from "../lib/player/native-player";
import { E2eHlsEngine } from "../test/e2e-hls-engine";
import { createNativeMediaControls } from "./media-controls";
import { watchNativeWindowClose } from "./window-close";

export type AppServices = {
  native: boolean;
  createGateway(serverUrl: string): JellyfinGateway;
  createPlayerEngine(): PlayerEngine;
  realtime: RealtimeConnection;
  // The user's streaming limits; a non-secret preference.
  streamingLimits: StreamingLimitStore;
  // LAN server discovery; desktop only, because a browser cannot send UDP.
  discovery?: ServerDiscovery;
  // Lets playback stop and report before the desktop window closes.
  watchWindowClose?: (beforeClose: () => Promise<void>) => () => void;
  // Lets the system media controls stop playback like Back.
  watchMediaControls?: PlayerServices["watchMediaControls"];
};

// Composition root: the only module that constructs the gateway, player
// engines, the realtime connection, and server discovery.
export function createServices(): AppServices {
  const native = isTauriRuntime();
  return {
    native,
    createGateway: (serverUrl) => new JellyfinGateway(serverUrl, undefined, getInstallId(), lanHttpConfirmations, streamingLimits),
    createPlayerEngine: () => {
      // Build-time only: the e2e dev server sets this; a production build
      // replaces it with undefined and drops the test engine.
      if (import.meta.env.VITE_FLUSTER_E2E_ENGINE === "fake-hls") return new E2eHlsEngine();
      return native ? new NativePlayerEngine() : new BrowserPlayerEngine();
    },
    streamingLimits,
    realtime: native ? new NativeRealtime() : new NoOpRealtime(),
    discovery: native ? new NativeServerDiscovery() : undefined,
    watchWindowClose: native ? watchNativeWindowClose : undefined,
    watchMediaControls: native ? createNativeMediaControls() : undefined,
  };
}
