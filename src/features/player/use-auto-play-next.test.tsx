import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NextEpisode } from "../../domain/catalog";
import type { PlaybackSnapshot } from "../../domain/playback";
import { AUTO_PLAY_SECONDS } from "./auto-play-next";
import { useAutoPlayCountdown } from "./use-auto-play-next";

const next: NextEpisode = { id: "episode-2", title: "Second" };

const snapshot: PlaybackSnapshot = {
  positionSeconds: 1180,
  durationSeconds: 1200,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("keeps counting when advance is new every render and calls only the latest one", async () => {
  // One stopAndLeave for every render: a new one would change playNow and restart the timer for another reason.
  const stopAndLeave = vi.fn(async (destination: () => void) => {
    destination();
    return true;
  });
  const advances: Array<ReturnType<typeof vi.fn<(next: NextEpisode) => void>>> = [];
  function freshProps() {
    const advance = vi.fn<(next: NextEpisode) => void>();
    advances.push(advance);
    return { next, snapshot, failed: false, advance, stopAndLeave };
  }

  const { result, rerender } = renderHook((props) => useAutoPlayCountdown(props), { initialProps: freshProps() });
  expect(result.current.secondsLeft).toBe(AUTO_PLAY_SECONDS);

  // Two re-renders per second, each with a new advance; a restarted timer would never reach the next tick.
  for (let left = AUTO_PLAY_SECONDS - 1; left >= 0; left -= 1) {
    act(() => vi.advanceTimersByTime(500));
    rerender(freshProps());
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.secondsLeft).toBe(left);
    if (left > 0) rerender(freshProps());
  }

  await act(async () => {
    await Promise.resolve();
  });
  expect(stopAndLeave).toHaveBeenCalledTimes(1);
  const latestCalls = advances.filter((advance) => advance.mock.calls.length > 0);
  expect(latestCalls).toHaveLength(1);
  expect(latestCalls[0]).toBe(advances[advances.length - 1]);
  expect(latestCalls[0]).toHaveBeenCalledTimes(1);
  expect(latestCalls[0]).toHaveBeenCalledWith(next);
  expect(advances[0]).not.toHaveBeenCalled();
});
