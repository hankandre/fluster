import { describe, expect, it } from "vitest";
import type { PlaybackSnapshot } from "../domain/playback";
import { initialPlaybackSessionState, playbackSessionReducer } from "./session-state";

const snapshot: PlaybackSnapshot = {
  positionSeconds: 31,
  paused: false,
  buffering: true,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware — VA-API", droppedFrames: 2 },
};

describe("playbackSessionReducer", () => {
  it("retains snapshot, first-frame readiness, and errors independently", () => {
    let state = playbackSessionReducer(initialPlaybackSessionState, { type: "reset" });
    state = playbackSessionReducer(state, { type: "event", event: { kind: "first-frame" } });
    state = playbackSessionReducer(state, { type: "event", event: { kind: "state", snapshot } });
    state = playbackSessionReducer(state, { type: "event", event: { kind: "error", message: "decode failed" } });
    state = playbackSessionReducer(state, {
      type: "event",
      event: { kind: "ended", snapshot: { ...snapshot, buffering: false }, reason: "error" },
    });

    expect(state).toMatchObject({
      firstFrameReady: true,
      error: "decode failed",
      snapshot: { positionSeconds: 31 },
    });
    expect(state.snapshot?.buffering).toBe(false);
    expect(state.snapshot?.diagnostics).toEqual(snapshot.diagnostics);
  });

  it("marks a failed stop, and a later player error clears the mark", () => {
    let state = playbackSessionReducer(initialPlaybackSessionState, { type: "failure", message: "The player did not stop.", stage: "stop" });
    expect(state).toMatchObject({ error: "The player did not stop.", errorStage: "stop" });
    state = playbackSessionReducer(state, { type: "event", event: { kind: "error", message: "decode failed" } });
    expect(state.errorStage).toBeUndefined();
    state = playbackSessionReducer(state, { type: "failure", message: "x", kind: "network" });
    expect(state.errorStage).toBeUndefined();
  });

  it("does not discard diagnostics when a first-frame event arrives after state", () => {
    let state = playbackSessionReducer(initialPlaybackSessionState, {
      type: "event",
      event: { kind: "loaded", snapshot },
    });
    state = playbackSessionReducer(state, { type: "event", event: { kind: "first-frame" } });
    expect(state.snapshot?.diagnostics).toEqual(snapshot.diagnostics);
    expect(state.snapshot).toEqual(snapshot);
  });
});
