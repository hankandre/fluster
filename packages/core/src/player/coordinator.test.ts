import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEvent } from "../domain/playback";
import { PlaybackCancelledError, PlaybackCoordinator, PlayerStopError, type PlaybackGateway } from "./coordinator";
import { FakeClock } from "../ports/fake-clock";
import { createFakePlayerEngine } from "./fake-player-engine";

const item: LibraryItem = {
  id: "one",
  name: "One",
  type: "Movie",
  resumePositionTicks: 120_000_000,
  played: false,
};
const plan: PlaybackPlan = {
  itemId: "one",
  title: "One",
  streamUrl: "https://media.test/video",
  mediaSourceId: "source",
  playSessionId: "session",
  startPositionTicks: 0,
  tracks: [],
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};
const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software — CPU", droppedFrames: 0 },
};

// A converting session. Each call gets a fresh play session.
function hlsPlan(playSessionId: string): PlaybackPlan {
  return {
    ...plan,
    streamUrl: "https://media.test/videos/one/master.m3u8",
    playSessionId,
    delivery: "hls",
    playMethod: "Transcode",
    conversionReasons: ["ContainerBitrateExceedsLimit"],
    serverUrl: "https://media.test",
    mediaKind: "videos",
  };
}

// Records the order of negotiation, reports, and encode stops.
function orderedGateway(order: string[], plans: PlaybackPlan[]): PlaybackGateway {
  const queue = [...plans];
  return {
    createPlaybackPlan: vi.fn(async () => {
      const next = queue.shift()!;
      order.push(`negotiate -> ${next.playSessionId}`);
      return next;
    }),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async (stopped: PlaybackPlan) => { order.push(`stopped ${stopped.playSessionId}`); }),
    sessionId: () => "session-1",
    stopActiveEncoding: vi.fn(async (playSessionId: string) => { order.push(`delete ${playSessionId}`); }),
  };
}

// The shared port-only fake, with spies on the members these tests script or count.
function fakePlayer() {
  const fake = createFakePlayerEngine();
  return {
    ...fake,
    subscribe: vi.spyOn(fake.engine, "subscribe"),
    launch: vi.spyOn(fake.engine, "launch"),
    stop: vi.spyOn(fake.engine, "stop"),
  };
}

describe("PlaybackCoordinator", () => {
  it("reports after load, on pause/seek, and on completion", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal)));
    player.emit({ kind: "state", snapshot: { ...snapshot, paused: true }, cause: "pause" });
    await vi.waitFor(() => expect(gateway.reportProgress).toHaveBeenCalled());
    player.emit({ kind: "ended", snapshot, reason: "eof" });
    await vi.waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), false));
  });

  it("renegotiates PlaybackInfo and replaces the authenticated session on retry", async () => {
    const replacementPlan = {
      ...plan,
      streamUrl: "https://media.test/video?other=1",
      playSessionId: "session-2",
    };
    const gateway = {
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce(replacementPlan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    }, new FakeClock());

    await coordinator.start(item, { kind: "resume", startPositionTicks: item.resumePositionTicks });
    player.emit({ kind: "error", code: "network" });
    await coordinator.retry();

    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(1, item, item.resumePositionTicks, expect.any(AbortSignal));
    expect(gateway.createPlaybackPlan).toHaveBeenNthCalledWith(2, item, item.resumePositionTicks, expect.any(AbortSignal));
    // One typed request per launch, built from the plan and the session id: no header, no reader for one.
    expect(player.launch.mock.calls).toEqual([
      [{ kind: "original", url: plan.streamUrl, sessionId: "session-1", startPositionSeconds: 0, tracks: [] }],
      [{ kind: "original", url: replacementPlan.streamUrl, sessionId: "session-1", startPositionSeconds: 0, tracks: [] }],
    ]);
  });

  it("refuses to relaunch a retry with the failed play-session ID", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    }, new FakeClock());

    await coordinator.start(item);
    await expect(coordinator.retry()).rejects.toThrow("reused the failed playback session");
    expect(player.launch).toHaveBeenCalledTimes(1);
  });

  it("rejects a retry whose stop failed with a PlayerStopError that carries no native text", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    player.stop.mockRejectedValueOnce(new Error("mpv did not stop at /home/u/x.mkv"));

    const failure = await coordinator.retry().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PlayerStopError);
    expect(String(failure)).not.toContain("x.mkv");
    expect(player.launch).toHaveBeenCalledTimes(1);
  });

  it("serializes start, track-change, seek, and stop reports", async () => {
    const reportOrder: string[] = [];
    const record = async (name: string) => {
      reportOrder.push(`${name}:start`);
      await Promise.resolve();
      reportOrder.push(`${name}:done`);
    };
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(() => record("start")),
      reportProgress: vi.fn(() => record("progress")),
      reportStopped: vi.fn(() => record("stop")),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    }, new FakeClock());

    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    player.emit({ kind: "tracks-changed", snapshot });
    player.emit({ kind: "state", snapshot, cause: "seek" });
    player.emit({ kind: "ended", snapshot, reason: "eof" });
    await coordinator.flush();

    expect(reportOrder).toEqual([
      "start:start", "start:done",
      "progress:start", "progress:done",
      "progress:start", "progress:done",
      "stop:start", "stop:done",
    ]);
  });

  it("reports periodic progress through the same queue", async () => {
    const clock = new FakeClock();
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    }, clock);

    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    await coordinator.flush();
    await clock.advance(10_000);
    await coordinator.flush();
    expect(gateway.reportProgress).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal));
    await coordinator.stop();
  });

  it("cancels negotiation before it can subscribe or launch", async () => {
    let resolvePlan!: (value: PlaybackPlan) => void;
    const gateway = {
      createPlaybackPlan: vi.fn(() => new Promise<PlaybackPlan>((resolve) => { resolvePlan = resolve; })),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    }, new FakeClock());

    const starting = coordinator.start(item);
    await vi.waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalled());
    const stopping = coordinator.stop();
    resolvePlan(plan);

    await expect(starting).rejects.toBeInstanceOf(PlaybackCancelledError);
    await stopping;
    expect(player.subscribe).not.toHaveBeenCalled();
    expect(player.launch).not.toHaveBeenCalled();
  });

  // P10-04: a converted launch checks playlists before it resolves. Stop
  // asks the engine to stop at once, which cancels the pending launch.
  it("stops the engine while a launch is still pending, so Stop does not wait it out", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    let rejectLaunch!: (error: Error) => void;
    player.launch.mockImplementation(() => new Promise<undefined>((_resolve, reject) => { rejectLaunch = reject; }));
    player.stop.mockImplementation(async () => rejectLaunch(new Error("The playback launch was cancelled.")));
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());

    const starting = coordinator.start(item);
    await vi.waitFor(() => expect(player.launch).toHaveBeenCalled());
    await coordinator.stop();

    await expect(starting).rejects.toBeInstanceOf(PlaybackCancelledError);
    expect(player.stop.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("waits for the stop that cancelled a pending launch before its own stop", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    let rejectLaunch!: (error: Error) => void;
    let finishCancelStop!: () => void;
    const order: string[] = [];
    player.launch.mockImplementation(() => new Promise<undefined>((_resolve, reject) => { rejectLaunch = reject; }));
    player.stop
      .mockImplementationOnce(() => {
        rejectLaunch(new Error("The playback launch was cancelled."));
        return new Promise<void>((resolve) => {
          finishCancelStop = () => { order.push("cancel stop done"); resolve(); };
        });
      })
      .mockImplementation(async () => { order.push("stop"); });
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());

    const starting = coordinator.start(item);
    await vi.waitFor(() => expect(player.launch).toHaveBeenCalled());
    let stopped = false;
    const stopping = coordinator.stop().then(() => { stopped = true; });
    await expect(starting).rejects.toBeInstanceOf(PlaybackCancelledError);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stopped).toBe(false);
    expect(order).toEqual([]);
    finishCancelStop();
    await stopping;
    expect(order).toEqual(["cancel stop done", "stop"]);
  });

  it("delivers later player events while a report is still pending", async () => {
    let finishReport!: () => void;
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(() => new Promise<void>((resolve) => { finishReport = resolve; })),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const onEvent = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent,
      onReportingError: vi.fn(),
    }, new FakeClock());

    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    player.emit({ kind: "state", snapshot: { ...snapshot, positionSeconds: 43 } });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
    finishReport();
    await coordinator.stop();
  });

  it("returns to the library without waiting for final reporting", async () => {
    let finishStartReport!: () => void;
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(() => new Promise<void>((resolve) => { finishStartReport = resolve; })),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const onSessionEnded = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
      onSessionEnded,
    }, new FakeClock());

    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());

    await coordinator.stop();

    expect(onSessionEnded).toHaveBeenCalledWith("stopped");
    expect(gateway.reportStopped).not.toHaveBeenCalled();

    finishStartReport();
    await coordinator.flush();
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), false);
  });

  it("keeps the player mounted until native teardown finishes", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    let finishNativeStop!: () => void;
    player.stop.mockImplementation(() => new Promise<void>((resolve) => {
      finishNativeStop = resolve;
    }));
    const onEvent = vi.fn();
    const onSessionEnded = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent,
      onReportingError: vi.fn(),
      onSessionEnded,
    }, new FakeClock());

    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    const stopping = coordinator.stop();
    await vi.waitFor(() => expect(player.stop).toHaveBeenCalled());

    player.emit({ kind: "ended", snapshot, reason: "stopped" });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "ended" }),
    ));
    expect(onSessionEnded).not.toHaveBeenCalled();

    finishNativeStop();
    await stopping;
    expect(onSessionEnded).toHaveBeenCalledWith("stopped");
  });

  it("bounds final report draining when the transport ignores cancellation", async () => {
    const clock = new FakeClock();
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(() => new Promise<void>(() => undefined)),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const onReportingError = vi.fn();
    const onSessionEnded = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError,
      onSessionEnded,
    }, clock);

    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    player.emit({ kind: "ended", snapshot, reason: "eof" });
    await clock.advance(5_000);
    expect(onReportingError).toHaveBeenCalledWith(expect.stringContaining("shutdown deadline"));
    expect(onSessionEnded).toHaveBeenCalledWith("eof");
  });

  it("lets Back return without waiting for a hung stopped report from the previous attempt", async () => {
    const replacementPlan = { ...plan, playSessionId: "session-2" };
    const gateway = {
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce(replacementPlan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      // A server that never answers and ignores cancellation.
      reportStopped: vi.fn(() => new Promise<void>(() => undefined)),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    }, new FakeClock());

    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalledTimes(1));
    const retrying = coordinator.retry().catch(() => undefined);
    await vi.waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledTimes(1));

    const outcome = await Promise.race([
      coordinator.stop().then(() => "returned"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 200)),
    ]);
    await retrying;

    expect(outcome).toBe("returned");
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
  });

  it("does not relaunch when stop overtakes a retry", async () => {
    const replacementPlan = { ...plan, playSessionId: "session-2" };
    const gateway = {
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce(replacementPlan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    let finishStop!: () => void;
    const stoppingPlayer = new Promise<void>((resolve) => { finishStop = resolve; });
    player.stop.mockImplementation(() => stoppingPlayer);
    const coordinator = new PlaybackCoordinator(gateway, player.engine, {
      onEvent: vi.fn(),
      onReportingError: vi.fn(),
    }, new FakeClock());

    await coordinator.start(item);
    const retrying = coordinator.retry();
    await vi.waitFor(() => expect(player.stop).toHaveBeenCalledTimes(1));
    const stopping = coordinator.stop();
    finishStop();

    await expect(retrying).rejects.toBeInstanceOf(PlaybackCancelledError);
    await stopping;
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
    expect(player.launch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an error ending", { kind: "ended", snapshot, reason: "error" } as PlayerEvent, true],
    ["a recovered error event before eof", { kind: "ended", snapshot, reason: "eof" } as PlayerEvent, false],
    ["a normal eof", { kind: "ended", snapshot, reason: "eof" } as PlayerEvent, false],
  ])("sends Failed correctly for %s", async (name, ending, failed) => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
    if (name === "a recovered error event before eof") player.emit({ kind: "error", code: "decoder-failed" });
    player.emit(ending);
    await vi.waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), failed));
  });

  it("marks the stop sent by a retry after an error as failed", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce({ ...plan, playSessionId: "session-2" }),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
    player.emit({ kind: "error", code: "network" });
    await coordinator.retry();
    await coordinator.flush();
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), true);
  });

  it("sends a failed stopped report when launch fails after the start was reported", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    player.launch.mockImplementation(async () => {
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      throw new Error("launch failed");
    });
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());

    // T2-05: an untyped launch rejection becomes the "unknown" player error code.
    await expect(coordinator.start(item)).rejects.toMatchObject({ code: "unknown" });
    await coordinator.flush();

    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), true);
  });

  it("drops all player text from a launch failure that a native engine sends as a string, and still reports a failed stop", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    player.launch.mockImplementation(async () => {
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      throw 'mpv could not open https://media.test/x?api_key=SECRET-TOKEN (Token="SECRET-TOKEN")';
    });
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());

    const caught = await coordinator.start(item).then(() => undefined, (error: unknown) => error);
    await coordinator.flush();

    expect(caught).toMatchObject({ code: "unknown" });
    for (const leak of ["mpv could not open", "SECRET-TOKEN", "media.test", "api_key"]) {
      expect(String(caught)).not.toContain(leak);
      expect(JSON.stringify(caught)).not.toContain(leak);
    }
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), true);
  });

  it.each([
    ["string", "mpv did not stop at https://media.test/x?api_key=SECRET-TOKEN"],
    ["Error", new Error("mpv did not stop at https://media.test/x?api_key=SECRET-TOKEN")],
  ])("reports a failed stop after the end (%s) as the stop-failed code, never the native message", async (_label, failure) => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    player.stop.mockRejectedValueOnce(failure);
    const onEvent = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent, onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
    player.emit({ kind: "ended", snapshot, reason: "eof" });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" })));
    const errorEvent = onEvent.mock.calls.map(([event]) => event).find((event) => event.kind === "error");
    expect(errorEvent).toEqual({ kind: "error", code: "stop-failed" });
    expect(JSON.stringify(errorEvent)).not.toContain("SECRET-TOKEN");
  });

  function plainGateway(): PlaybackGateway {
    return {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
  }

  it("keeps a file path and host out of a failed stop after the end", async () => {
    const gateway = plainGateway();
    const player = fakePlayer();
    player.stop.mockRejectedValueOnce(new Error("mpv did not stop: cannot open /video.mkv on media.local:8096"));
    const onEvent = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent, onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    player.emit({ kind: "loaded", snapshot });
    await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
    player.emit({ kind: "ended", snapshot, reason: "eof" });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" })));
    const errorEvent = onEvent.mock.calls.map(([event]) => event).find((event) => event.kind === "error");
    expect(errorEvent).toEqual({ kind: "error", code: "stop-failed" });
    expect(JSON.stringify(errorEvent)).not.toContain("video.mkv");
    expect(JSON.stringify(errorEvent)).not.toContain("media.local");
  });

  it("keeps only the code of a native error event, dropping its file path and host", async () => {
    const player = fakePlayer();
    const onEvent = vi.fn();
    const coordinator = new PlaybackCoordinator(plainGateway(), player.engine, { onEvent, onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    // A bridge that adds free text next to the code (cast: the port has no message field).
    player.emit({
      kind: "error",
      code: "decoder-failed",
      message: "libmpv reported a playback error: C:/Users/u/x.mkv at 192.168.1.10:8096",
    } as unknown as PlayerEvent);

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" })));
    const errorEvent = onEvent.mock.calls.map(([event]) => event).find((event) => event.kind === "error");
    expect(errorEvent).toEqual({ kind: "error", code: "decoder-failed" });
    expect(JSON.stringify(errorEvent)).not.toContain("libmpv");
    expect(JSON.stringify(errorEvent)).not.toContain("Users");
    expect(JSON.stringify(errorEvent)).not.toContain("192.168");
  });

  it("gives the unknown code for an error event that carries no code", async () => {
    const player = fakePlayer();
    const onEvent = vi.fn();
    const coordinator = new PlaybackCoordinator(plainGateway(), player.engine, { onEvent, onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    player.emit({ kind: "error", message: "" } as unknown as PlayerEvent);

    await vi.waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith({ kind: "error", code: "unknown" }),
    );
  });

  it("gives the stop-failed code when a failed stop has no text", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => plan),
      reportStart: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
      reportStopped: vi.fn(async () => undefined),
      sessionId: () => "session-1",
      stopActiveEncoding: vi.fn(async () => undefined),
    } as PlaybackGateway;
    const player = fakePlayer();
    player.stop.mockRejectedValueOnce({ code: 1 });
    const onEvent = vi.fn();
    const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent, onReportingError: vi.fn() }, new FakeClock());
    await coordinator.start(item);
    player.emit({ kind: "ended", snapshot, reason: "eof" });

    await vi.waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith({ kind: "error", code: "stop-failed" }),
    );
  });

  describe("stopping server encodes (P10-07)", () => {
    it("stops the old encode before negotiating a retry of a converting item", async () => {
      const order: string[] = [];
      const gateway = orderedGateway(order, [hlsPlan("old"), hlsPlan("new")]);
      const player = fakePlayer();
      const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());

      await coordinator.start(item);
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      player.emit({ kind: "ended", snapshot, reason: "error" });
      await vi.waitFor(() => expect(order).toContain("stopped old"));
      await coordinator.retry();

      expect(order).toEqual(["negotiate -> old", "stopped old", "delete old", "negotiate -> new"]);
      expect(gateway.stopActiveEncoding).toHaveBeenCalledWith("old", expect.any(AbortSignal));
    });

    it("stops the old encode before renegotiating at the current position (Play original, track change)", async () => {
      const order: string[] = [];
      const gateway = orderedGateway(order, [hlsPlan("old"), plan]);
      const player = fakePlayer();
      const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());

      await coordinator.start(item);
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      await coordinator.retry(420_000_000);

      expect(order).toEqual(["negotiate -> old", "stopped old", "delete old", "negotiate -> session"]);
      expect(gateway.createPlaybackPlan).toHaveBeenLastCalledWith(item, 420_000_000, expect.any(AbortSignal));
    });

    it("stops no encode when retrying a direct-play session", async () => {
      const order: string[] = [];
      const gateway = orderedGateway(order, [plan, { ...plan, playSessionId: "session-2" }]);
      const player = fakePlayer();
      const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());

      await coordinator.start(item);
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());
      await coordinator.retry(0);

      expect(gateway.stopActiveEncoding).not.toHaveBeenCalled();
    });

    it.each([
      ["fails", () => Promise.reject(new Error("Request failed with status code 503"))],
      ["times out", () => new Promise<void>(() => undefined)],
    ])("sends one DELETE when the stopped report %s, and Stop does not wait for either", async (_name, stopped) => {
      const clock = new FakeClock();
      const gateway = {
        createPlaybackPlan: vi.fn(async () => hlsPlan("converting")),
        reportStart: vi.fn(async () => undefined),
        reportProgress: vi.fn(async () => undefined),
        reportStopped: vi.fn(stopped),
        // A server that never answers and ignores cancellation.
        sessionId: () => "session-1",
        stopActiveEncoding: vi.fn(() => new Promise<void>(() => undefined)),
      } as PlaybackGateway;
      const player = fakePlayer();
      const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, clock);
      await coordinator.start(item);
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());

      let returned = false;
      void coordinator.stop().then(() => { returned = true; });
      await clock.advance(0);
      expect(returned).toBe(true);

      let flushed = false;
      void coordinator.flush().then(() => { flushed = true; });
      await clock.advance(5_000);
      expect(gateway.stopActiveEncoding).toHaveBeenCalledTimes(1);
      expect(gateway.stopActiveEncoding).toHaveBeenCalledWith("converting", expect.any(AbortSignal));
      await clock.advance(3_000);
      expect(flushed).toBe(true);
      expect(gateway.stopActiveEncoding).toHaveBeenCalledTimes(1);
    });

    it("sends no DELETE when the stopped report for a conversion succeeds", async () => {
      const order: string[] = [];
      const gateway = orderedGateway(order, [hlsPlan("converting")]);
      const player = fakePlayer();
      const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
      await coordinator.start(item);
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());

      await coordinator.stop();
      await coordinator.flush();

      expect(order).toEqual(["negotiate -> converting", "stopped converting"]);
    });

    it("sends the DELETE once when a retry follows a failed stopped report", async () => {
      const order: string[] = [];
      const gateway = orderedGateway(order, [hlsPlan("old"), hlsPlan("new")]);
      gateway.reportStopped = vi.fn(async () => {
        order.push("stopped failed");
        throw new Error("offline");
      });
      const player = fakePlayer();
      const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
      await coordinator.start(item);
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());

      await coordinator.retry();

      expect(order).toEqual(["negotiate -> old", "stopped failed", "delete old", "negotiate -> new"]);
    });

    it("lets Back leave a retry that is still waiting on a hung DELETE", async () => {
      const gateway = orderedGateway([], [hlsPlan("old"), hlsPlan("new")]);
      gateway.stopActiveEncoding = vi.fn(() => new Promise<void>(() => undefined));
      const player = fakePlayer();
      const coordinator = new PlaybackCoordinator(gateway, player.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
      await coordinator.start(item);
      player.emit({ kind: "loaded", snapshot });
      await vi.waitFor(() => expect(gateway.reportStart).toHaveBeenCalled());

      const retrying = coordinator.retry().catch((error: unknown) => error);
      await vi.waitFor(() => expect(gateway.stopActiveEncoding).toHaveBeenCalledTimes(1));
      const outcome = await Promise.race([
        coordinator.stop().then(() => "returned"),
        new Promise((resolve) => setTimeout(() => resolve("blocked"), 200)),
      ]);

      expect(outcome).toBe("returned");
      expect(await retrying).toBeInstanceOf(PlaybackCancelledError);
      expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
    });
  });
});
