// T2-05 review follow-up (D14): every engine event is rebuilt from its known fields.
import { describe, expect, it } from "vitest";
import type { PlaybackSnapshot } from "../domain/playback";
import { playbackSnapshot, playerEvent } from "./player-event";

const CANARY = "mpv could not open https://media.test/x?api_key=SECRET-TOKEN /home/u/x.mkv";
const LEAKS = ["mpv", "SECRET-TOKEN", "media.test", "/home/u"];

const snapshot: PlaybackSnapshot = {
  positionSeconds: 7,
  durationSeconds: 60,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  audioTrack: 1,
  subtitleTrack: 2,
  tracks: [{ playerId: 1, jellyfinIndex: 1, type: "Audio", title: "English", language: "eng", external: false, selected: true }],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", videoCodec: "hevc", bitDepth: 10, width: 3840, height: 2160, droppedFrames: 0 },
  video: { codec: "hevc", range: "pq" },
  audio: { codec: "eac3", channelCount: 6, output: "passthrough", passthroughFormat: "eac3" },
  bufferedSeconds: 12,
};

function smuggled(): Record<string, unknown> {
  return {
    ...snapshot,
    message: CANARY,
    tracks: [{ ...snapshot.tracks[0], message: CANARY }],
    diagnostics: { ...snapshot.diagnostics, message: CANARY },
    video: { ...snapshot.video, message: CANARY },
    audio: { ...snapshot.audio, message: CANARY },
  };
}

function expectClean(value: unknown): void {
  const text = JSON.stringify(value);
  for (const leak of LEAKS) expect(text).not.toContain(leak);
}

describe("playerEvent", () => {
  it("keeps every known field of a well-formed event", () => {
    expect(playerEvent({ kind: "loaded", snapshot })).toStrictEqual({ kind: "loaded", snapshot });
    expect(playerEvent({ kind: "state", snapshot, cause: "seek" })).toStrictEqual({ kind: "state", snapshot, cause: "seek" });
    expect(playerEvent({ kind: "tracks-changed", snapshot })).toStrictEqual({ kind: "tracks-changed", snapshot });
    expect(playerEvent({ kind: "first-frame" })).toStrictEqual({ kind: "first-frame" });
    expect(playerEvent({ kind: "ended", snapshot, reason: "eof" })).toStrictEqual({ kind: "ended", snapshot, reason: "eof" });
    expect(playerEvent({ kind: "ended", reason: "stopped" })).toStrictEqual({ kind: "ended", reason: "stopped" });
    expect(playerEvent({ kind: "error", code: "network" })).toStrictEqual({ kind: "error", code: "network" });
  });

  it.each(["loaded", "state", "tracks-changed", "ended", "first-frame", "error"])("drops a smuggled message on %s, at any depth", (kind) => {
    const event = playerEvent({ kind, snapshot: smuggled(), reason: "error", code: "network", cause: "pause", message: CANARY, detail: { text: CANARY } });
    expect(event).toBeDefined();
    expect(event).not.toHaveProperty("message");
    expect(event).not.toHaveProperty("detail");
    expectClean(event);
    if (event && "snapshot" in event) expect(event.snapshot).toStrictEqual(snapshot);
  });

  it.each([
    { kind: "warning", message: CANARY },
    { kind: "log", text: CANARY },
    { message: CANARY },
    CANARY,
    null,
    undefined,
    [{ kind: "ended", reason: "eof" }],
  ])("drops an event outside the known kinds: %j", (value) => {
    expect(playerEvent(value)).toBeUndefined();
  });

  it("drops a snapshot event whose snapshot cannot be read", () => {
    expect(playerEvent({ kind: "loaded" })).toBeUndefined();
    expect(playerEvent({ kind: "state", snapshot: CANARY })).toBeUndefined();
    expect(playerEvent({ kind: "tracks-changed", snapshot: { ...snapshot, positionSeconds: Number.NaN } })).toBeUndefined();
  });

  it("ends a session whose end reason or snapshot cannot be read, as failed and without the snapshot", () => {
    expect(playerEvent({ kind: "ended", reason: CANARY, snapshot: CANARY })).toStrictEqual({ kind: "ended", reason: "error" });
  });

  it("omits an unknown state cause and maps an unknown error code to unknown", () => {
    expect(playerEvent({ kind: "state", snapshot, cause: CANARY })).toStrictEqual({ kind: "state", snapshot });
    expect(playerEvent({ kind: "error", code: CANARY })).toStrictEqual({ kind: "error", code: "unknown" });
  });

  it("drops an unreadable track and unreadable optional facts", () => {
    const copy = playbackSnapshot({ ...snapshot, tracks: [CANARY, ...snapshot.tracks], video: { range: CANARY }, audio: { passthroughFormat: CANARY, output: CANARY } });
    const { video: _video, ...rest } = snapshot;
    expect(copy).toStrictEqual({ ...rest, audio: {} });
    expect(copy).not.toHaveProperty("video");
    expectClean(copy);
  });
});
