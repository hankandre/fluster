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

describe("Sign-out destination", () => {
  it("wins over an auto-play advance that arrives while the stop is pending", async () => {
    const engine = new FakePlayerEngine();
    let finishStop: () => void = () => undefined;
    engine.stop.mockImplementation(() => new Promise<undefined>((resolve) => { finishStop = () => resolve(undefined); }));
    const gateway = fakeSessionGateway({ createPlaybackPlan: vi.fn().mockResolvedValue(plan) });
    const onLeave = vi.fn();
    const { result } = renderHook(() => usePlaybackSession({
      gateway,
      player: { engine },
      item: { id: "e1", name: "Pilot", type: "Episode", resumePositionTicks: 0, played: false },
      mediaSourceId: "src",
      startTicks: 0,
      onSessionEnded: vi.fn(),
      onLeave,
    }));
    await waitFor(() => expect(engine.launch).toHaveBeenCalled());
    await act(async () => {
      engine.emit({ kind: "loaded", snapshot });
      engine.emit({ kind: "first-frame" });
    });

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
});
