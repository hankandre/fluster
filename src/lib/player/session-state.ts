import type { PlaybackSnapshot, PlayerEvent } from "../../domain/playback";

import type { TransportErrorKind } from "../transport-error";

export interface PlaybackSessionState {
  snapshot?: PlaybackSnapshot;
  firstFrameReady: boolean;
  error?: string;
  // Set when the failure was a failed Jellyfin request; the view shows plain copy for it, not the message.
  errorKind?: TransportErrorKind;
  reportingWarning?: string;
}

export type PlaybackSessionAction =
  | { type: "reset" }
  | { type: "event"; event: PlayerEvent }
  | { type: "failure"; message: string; kind?: TransportErrorKind }
  | { type: "reporting-warning"; message?: string };

export const initialPlaybackSessionState: PlaybackSessionState = {
  firstFrameReady: false,
};

export function playbackSessionReducer(
  state: PlaybackSessionState,
  action: PlaybackSessionAction,
): PlaybackSessionState {
  switch (action.type) {
    case "reset":
      return initialPlaybackSessionState;
    case "failure":
      return { ...state, error: action.message, errorKind: action.kind };
    case "reporting-warning":
      return { ...state, reportingWarning: action.message };
    case "event":
      return reducePlayerEvent(state, action.event);
  }
}

function reducePlayerEvent(state: PlaybackSessionState, event: PlayerEvent): PlaybackSessionState {
  switch (event.kind) {
    case "first-frame":
      return { ...state, firstFrameReady: true };
    case "error":
      return { ...state, error: event.message, errorKind: undefined };
    case "ended":
      return { ...state, snapshot: event.snapshot ?? state.snapshot };
    case "loaded":
    case "state":
    case "tracks-changed":
      return {
        ...state,
        snapshot: event.snapshot,
      };
  }
}
