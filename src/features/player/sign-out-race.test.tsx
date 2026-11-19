import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { usePlaybackSession } from "./use-playback-session";

const plan: PlaybackPlan = {
  itemId: "e1",
  title: "Pilot",
  streamUrl: "https://media.test/Videos/e1/stream?Static=true",
  mediaSourceId: "src",
  playSessionId: "play-1",
  startPositionTicks: 0,
  tracks: [],
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};

const snapshot: PlaybackSnapshot = {
  positionSeconds: 10,
  durationSeconds: 1200,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};

function mount(gateway = fakeSessionGateway({ createPlaybackPlan: vi.fn().mockResolvedValue(plan) })) {
  const engine = new FakePlayerEngine();
  let finishStop: () => void = () => undefined;
  engine.stop.mockImplementation(() => new Promise<undefined>((resolve) => { finishStop = () => resolve(undefined); }));
  const onLeave = vi.fn();
  const rendered = renderHook(() => usePlaybackSession({
    gateway,
    player: { engine },
    item: { id: "e1", name: "Pilot", type: "Episode", resumePositionTicks: 0, played: false },
    mediaSourceId: "src",
    startTicks: 0,
    onSessionEnded: vi.fn(),
    onLeave,
  }));
  return { engine, onLeave, result: rendered.result, finishStop: () => finishStop() };
}

async function playing(engine: FakePlayerEngine) {
  await waitFor(() => expect(engine.launch).toHaveBeenCalled());
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot });
    engine.emit({ kind: "first-frame" });
  });
}

describe("Sign-out destination", () => {
  it("wins over an auto-play advance that arrives while the stop is pending", async () => {
    const { engine, onLeave, result, finishStop } = mount();
    await playing(engine);

    const signOut = vi.fn();
    const advance = vi.fn();
    let signOutResult: Promise<boolean> = Promise.resolve(false);
    let advanceResult: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      signOutResult = result.current.stopAndLeave(signOut, { final: true });
      advanceResult = result.current.stopAndLeave(advance);
      finishStop();
      await Promise.all([signOutResult, advanceResult]);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(advance).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("wins over an earlier back, such as a media-key Stop that arrived first", async () => {
    const { engine, onLeave, result, finishStop } = mount();
    await playing(engine);

    const signOut = vi.fn();
    await act(async () => {
      const stop = result.current.stopAndLeave();
      const confirmed = result.current.stopAndLeave(signOut, { final: true });
      finishStop();
      await Promise.all([stop, confirmed]);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("completes after Back already stopped and left, because there is nothing to stop", async () => {
    const { engine, onLeave, result, finishStop } = mount();
    await playing(engine);
    // Back finishes: leave() clears the session and navigates, and the confirm lands before the route changes.
    await act(async () => {
      const back = result.current.stopAndLeave();
      finishStop();
      await back;
    });
    expect(onLeave).toHaveBeenCalledTimes(1);
    engine.stop.mockClear();

    const signOut = vi.fn();
    let signedOut = false;
    await act(async () => {
      signedOut = await result.current.stopAndLeave(signOut, { final: true });
    });

    expect(signedOut).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(engine.stop).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
