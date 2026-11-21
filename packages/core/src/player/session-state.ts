import type { PlaybackSnapshot, PlayerErrorCode, PlayerEvent } from "../domain/playback";
import { PLAYER_ERROR_MESSAGES, playerErrorCode } from "../domain/playback";

import type { TransportErrorKind } from "../transport-error";

export interface PlaybackSessionState {
  snapshot?: PlaybackSnapshot;
  firstFrameReady: boolean;
  error?: string;
  // Set only by a player error event: the engine's typed code. A failure action clears it.
  errorCode?: PlayerErrorCode;
  // Set when the failure was a failed Jellyfin request; the view shows plain copy for it, not the message.
  errorKind?: TransportErrorKind;
  // Set when stopping the player failed; the view shows plain stop copy, not the message.
  errorStage?: "stop";
  reportingWarning?: string;
}

export type PlaybackSessionAction =
  | { type: "reset" }
  | { type: "event"; event: PlayerEvent }
  | { type: "failure"; message: string; kind?: TransportErrorKind; stage?: "stop" }
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
      return { ...state, error: action.message, errorCode: undefined, errorKind: action.kind, errorStage: action.stage };
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
    case "error": {
      const code = playerErrorCode(event.code);
      return { ...state, error: PLAYER_ERROR_MESSAGES[code], errorCode: code, errorKind: undefined, errorStage: undefined };
    }
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
