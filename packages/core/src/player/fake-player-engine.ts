import type { LaunchRequest, PlayerCapabilities, PlayerEngine, PlayerEvent } from "../domain/player-engine";

// A PlayerEngine for tests that implements only the port (T2-05). Script behaviour with
// `vi.spyOn(engine, "launch")` and the like; `emit` sends an event to every current subscriber.
export interface FakePlayerEngine {
  engine: PlayerEngine;
  emit(event: PlayerEvent): void;
  // Every request `launch` received, in order.
  launches: LaunchRequest[];
}

export function fakeCapabilities(): PlayerCapabilities {
  return {
    probe: "complete",
    videoDecoders: [
      { codec: "h264", hardware: true, profile: "High", maxBitDepth: 8, maxWidth: 3840, maxHeight: 2160 },
      { codec: "hevc", hardware: true, profile: "Main 10", maxBitDepth: 10 },
      { codec: "av1", hardware: false },
    ],
    audioDecoders: ["aac", "ac3", "eac3", "opus"],
    hdr: ["hdr10", "hlg"],
    passthrough: ["ac3", "eac3"],
  };
}

export function createFakePlayerEngine(): FakePlayerEngine {
  const listeners = new Set<(event: PlayerEvent) => void>();
  const launches: LaunchRequest[] = [];
  const engine = {
    async initialize() {
      return fakeCapabilities();
    },
    async subscribe(listener: (event: PlayerEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async launch(request: LaunchRequest) {
      launches.push(request);
    },
    async setPaused(_paused: boolean) {
      return undefined;
    },
    async seek(_positionSeconds: number) {
      return undefined;
    },
    async selectTrack(_type: "audio" | "subtitle", _playerId?: number) {
      return undefined;
    },
    async stop() {
      return undefined;
    },
  } satisfies PlayerEngine;
  const emit = (event: PlayerEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };
  return { engine, emit, launches };
}
