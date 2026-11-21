import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEvent } from "../domain/playback";
import { PlaybackCoordinator, type PlaybackGateway } from "./coordinator";
import { FakeClock } from "../ports/fake-clock";
import { createFakePlayerEngine } from "./fake-player-engine";

// P17-08: the coordinator owns a viewer's audio pick for the whole session.
const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };
const signal = expect.any(AbortSignal);
const PICK = { mediaSourceId: "source", audioStreamIndex: 2 };

function planFor(playSessionId: string, delivery: "static" | "hls" = "static"): PlaybackPlan {
  return {
    itemId: "one",
    title: "One",
    streamUrl: "https://media.test/video",
    mediaSourceId: "source",
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
    delivery,
    playMethod: delivery === "static" ? "DirectPlay" : "Transcode",
    conversionReasons: delivery === "static" ? [] : ["ContainerBitrateExceedsLimit"],
    ...(delivery === "hls" ? { serverUrl: "https://media.test", mediaKind: "videos" as const } : {}),
  } as PlaybackPlan;
}

function at(positionSeconds: number, audioTrack?: number): PlaybackSnapshot {
  return {
    positionSeconds,
    paused: false,
    buffering: false,
    volume: 100,
    muted: false,
    tracks: [],
    ...(audioTrack === undefined ? {} : { audioTrack }),
    diagnostics: { decodeMode: "software", decodeLabel: "Software", droppedFrames: 0 },
  };
}

// The shared port-only fake. Its stop reports `stopSnapshot` as a stopped ending when one is set.
function fakePlayer() {
  const fake = createFakePlayerEngine();
  const player = {
    ...fake,
    // The snapshot the engine's stop reports; set it to the position a test asserts.
    stopSnapshot: undefined as PlaybackSnapshot | undefined,
    launch: vi.spyOn(fake.engine, "launch"),
    stop: vi.spyOn(fake.engine, "stop"),
  };
  player.stop.mockImplementation(async () => {
    if (player.stopSnapshot) fake.emit({ kind: "ended", snapshot: player.stopSnapshot, reason: "stopped" });
  });
  return player;
}

function setup(delivery: "static" | "hls" = "static") {
  let sessions = 0;
  const gateway = {
    createPlaybackPlan: vi.fn(async () => planFor(`session-${++sessions}`, delivery)),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    sessionId: () => "session-1",
    stopActiveEncoding: vi.fn(async () => undefined),
  } as PlaybackGateway;
  const player = fakePlayer();
  const onAudioPickNotApplied = vi.fn();
  const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn(), onAudioPickNotApplied }, new FakeClock());
  const emit = async (event: PlayerEvent) => {
    player.emit(event);
    await coordinator.flush();
  };
  return { gateway, player, coordinator, emit, onAudioPickNotApplied };
}

describe("PlaybackCoordinator audio pick (P17-08)", () => {
  it("with no pick, calls the gateway without a selection and never reports an unapplied pick", async () => {
    const { gateway, coordinator, emit, onAudioPickNotApplied } = setup();
    await coordinator.start(item);
    await emit({ kind: "loaded", snapshot: at(0, 1) });
    expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[0]).toHaveLength(3);
    expect(onAudioPickNotApplied).not.toHaveBeenCalled();
  });

  it("with a pick, passes the version, the index, and keepDirectPlay", async () => {
    const { gateway, coordinator } = setup();
    await coordinator.start(item, undefined, PICK);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledWith(item, 0, signal, { ...PICK, keepDirectPlay: true });
  });

  it("a retry keeps the pick", async () => {
    const { gateway, coordinator, emit } = setup();
    await coordinator.start(item, undefined, PICK);
    await emit({ kind: "loaded", snapshot: at(0, 2) });
    await emit({ kind: "error", code: "decoder-failed" });
    await coordinator.retry();
    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, 0, signal, { ...PICK, keepDirectPlay: true });
  });

  it("a retry after the snapshot reported another audio index asks for that index", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(30, 1);
    await coordinator.start(item, undefined, PICK);
    await emit({ kind: "loaded", snapshot: at(0, 2) });
    await emit({ kind: "first-frame" });
    await emit({ kind: "tracks-changed", snapshot: at(20, 1) });
    await emit({ kind: "error", code: "decoder-failed" });
    await coordinator.retry();
    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, expect.any(Number), signal, {
      mediaSourceId: "source",
      audioStreamIndex: 1,
      keepDirectPlay: true,
    });
  });

  it("Play original keeps the pick and the flag", async () => {
    const { gateway, coordinator, emit } = setup("hls");
    await coordinator.start(item, undefined, PICK);
    await emit({ kind: "loaded", snapshot: at(0, 2) });
    await coordinator.renegotiate(undefined, {});
    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, expect.any(Number), signal, { ...PICK, keepDirectPlay: true });
  });

  it("a failed renegotiation's fallback keeps the flag", async () => {
    const { gateway, coordinator, emit } = setup();
    await coordinator.start(item, undefined, PICK);
    await emit({ kind: "loaded", snapshot: at(0, 2) });
    vi.mocked(gateway.createPlaybackPlan).mockRejectedValueOnce(new Error("no"));
    await coordinator.renegotiate(undefined, { audioStreamIndex: 3 }, { audioStreamIndex: 2 }).catch(() => undefined);
    await coordinator.retry();
    expect(gateway.createPlaybackPlan).toHaveBeenLastCalledWith(item, expect.any(Number), signal, {
      mediaSourceId: "source",
      audioStreamIndex: 2,
      keepDirectPlay: true,
    });
  });

  it("says once that the pick was not applied when the loaded snapshot names another track", async () => {
    const { coordinator, emit, onAudioPickNotApplied } = setup();
    await coordinator.start(item, undefined, PICK);
    await emit({ kind: "loaded", snapshot: at(0, 1) });
    await emit({ kind: "loaded", snapshot: at(0, 1) });
    expect(onAudioPickNotApplied).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the loaded snapshot names the pick", async () => {
    const { coordinator, emit, onAudioPickNotApplied } = setup();
    await coordinator.start(item, undefined, PICK);
    await emit({ kind: "loaded", snapshot: at(0, 2) });
    expect(onAudioPickNotApplied).not.toHaveBeenCalled();
  });

  it.each(["static", "hls"] as const)("reports the pick's Jellyfin index in a %s session", async (delivery) => {
    const { gateway, coordinator, emit } = setup(delivery);
    await coordinator.start(item, undefined, PICK);
    const loaded = at(0, 2);
    await emit({ kind: "loaded", snapshot: loaded });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalledWith(expect.objectContaining({ delivery }), loaded, signal));
  });

  it("a new start after the session ended carries nothing of the earlier pick", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(5, 1);
    await coordinator.start(item, undefined, PICK);
    await emit({ kind: "loaded", snapshot: at(0, 2) });
    await emit({ kind: "first-frame" });
    await coordinator.stop();
    await coordinator.start(item);
    expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[1]).toHaveLength(3);
  });

  it("a new start with its own pick is not overridden by an earlier session's track", async () => {
    const { gateway, player, coordinator, emit } = setup();
    player.stopSnapshot = at(5, 1);
    await coordinator.start(item, undefined, PICK);
    await emit({ kind: "loaded", snapshot: at(0, 2) });
    await emit({ kind: "first-frame" });
    await coordinator.stop();
    await coordinator.start(item, undefined, { mediaSourceId: "source", audioStreamIndex: 3 });
    expect(gateway.createPlaybackPlan).toHaveBeenLastCalledWith(item, 0, signal, { mediaSourceId: "source", audioStreamIndex: 3, keepDirectPlay: true });
  });
});
