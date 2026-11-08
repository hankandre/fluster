import type { MediaControlAction } from "./player-services";

// The native side's only media-control event (src-tauri/src/media_controls.rs).
const MEDIA_CONTROL_EVENT = "fluster://media-control";

export type Listen = (
  event: string,
  handler: (event: { payload: unknown }) => void,
) => Promise<unknown>;

export function mediaControlAction(payload: unknown): MediaControlAction | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const action = (payload as { action?: unknown }).action;
  return action === "stop" ? action : undefined;
}

async function tauriListen(): Promise<Listen> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen;
}

// Listens for system media-control requests (MPRIS) once, for the whole app,
// and returns how to watch them. The listener is registered at startup, long
// before any player can be stopped, and watching is synchronous, so a Stop
// can never arrive between a player mounting and its handler attaching.
// Unknown payloads are ignored.
export function createNativeMediaControls(
  loadListen: () => Promise<Listen> = tauriListen,
): (onAction: (action: MediaControlAction) => void) => () => void {
  const watchers = new Set<(action: MediaControlAction) => void>();
  void loadListen().then((listen) => listen(MEDIA_CONTROL_EVENT, ({ payload }) => {
    const action = mediaControlAction(payload);
    if (!action) return;
    for (const watcher of [...watchers]) watcher(action);
  }));
  return (onAction) => {
    watchers.add(onAction);
    return () => {
      watchers.delete(onAction);
    };
  };
}
