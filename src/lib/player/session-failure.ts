import { errorReason } from "../safe-reason";
import { classifyTransportError } from "../transport-error";
import type { PlaybackSessionAction } from "./session-state";

// A failed Jellyfin request keeps only its kind: the screen writes the copy, and
// the transport message stays out of state.
export function failureAction(error: unknown): PlaybackSessionAction {
  const kind = classifyTransportError(error);
  return { type: "failure", message: kind ? "Jellyfin request failed." : errorReason(error, "Something went wrong."), kind };
}

// A failed stop keeps no native text: the screen shows the stop copy for it.
export function stopFailureAction(): PlaybackSessionAction {
  return { type: "failure", message: "The player did not stop.", stage: "stop" };
}
