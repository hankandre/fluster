import type {
  PlaybackDiagnostics,
  PlaybackSnapshot,
  PlayerCapabilities,
  PlayerEvent,
} from "../../domain/playback";

export interface PlaybackSessionState {
  phase: "idle" | "loading" | "playing" | "ended" | "error";
  capabilities?: PlayerCapabilities;
  snapshot?: PlaybackSnapshot;
  firstFrameReady: boolean;
  buffering: boolean;
  diagnostics?: PlaybackDiagnostics;
  error?: string;
  reportingWarning?: string;
  endReason?: string;
}

export type PlaybackSessionAction =
  | { type: "reset" }
  | { type: "event"; event: PlayerEvent }
  | { type: "failure"; message: string }
  | { type: "reporting-warning"; message?: string };

export const initialPlaybackSessionState: PlaybackSessionState = {
  phase: "idle",
  firstFrameReady: false,
  buffering: false,
};

export function playbackSessionReducer(
  state: PlaybackSessionState,
  action: PlaybackSessionAction,
): PlaybackSessionState {
  switch (action.type) {
    case "reset":
      return { ...initialPlaybackSessionState, phase: "loading", capabilities: state.capabilities };
    case "failure":
      return { ...state, phase: "error", error: action.message, buffering: false };
    case "reporting-warning":
      return { ...state, reportingWarning: action.message };
    case "event":
      return reducePlayerEvent(state, action.event);
  }
}

function reducePlayerEvent(state: PlaybackSessionState, event: PlayerEvent): PlaybackSessionState {
  switch (event.kind) {
    case "ready":
      return { ...state, capabilities: event.capabilities };
    case "first-frame":
      return { ...state, firstFrameReady: true, phase: state.error ? "error" : "playing" };
    case "error":
      return { ...state, phase: "error", error: event.message, buffering: false };
    case "ended": {
      const snapshot = event.snapshot ?? state.snapshot;
      return {
        ...state,
        phase: state.error || event.reason === "error" ? "error" : "ended",
        snapshot,
        buffering: false,
        diagnostics: snapshot?.diagnostics ?? state.diagnostics,
        endReason: event.reason,
      };
    }
    case "loaded":
    case "state":
    case "tracks-changed":
      return {
        ...state,
        phase: state.error ? "error" : state.firstFrameReady ? "playing" : "loading",
        snapshot: event.snapshot,
        buffering: event.snapshot.buffering,
        diagnostics: event.snapshot.diagnostics,
      };
  }
}
