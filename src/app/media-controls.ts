import type { MediaControlAction } from "./player-services";

// The native side's only media-control event (src-tauri/src/media_controls.rs).
const MEDIA_CONTROL_EVENT = "fluster://media-control";

export function mediaControlAction(payload: unknown): MediaControlAction | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const action = (payload as { action?: unknown }).action;
  return action === "stop" ? action : undefined;
}

// Calls `onAction` for each request from the system media controls (MPRIS).
// Unknown payloads are ignored.
export function watchNativeMediaControls(onAction: (action: MediaControlAction) => void): () => void {
  let cancelled = false;
  let removeListener: (() => void) | undefined;
  void import("@tauri-apps/api/event").then(async ({ listen }) => {
    const unlisten = await listen(MEDIA_CONTROL_EVENT, ({ payload }) => {
      const action = mediaControlAction(payload);
      if (action) onAction(action);
    });
    if (cancelled) unlisten();
    else removeListener = unlisten;
  });
  return () => {
    cancelled = true;
    removeListener?.();
  };
}
