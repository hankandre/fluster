import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NextEpisode } from "../../domain/catalog";
import type { PlaybackSnapshot } from "../../domain/playback";
import { DEFAULT_AUTO_PLAY, type AutoPlayPreference } from "../../lib/preference-store";
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
    return { next, snapshot, autoPlay: DEFAULT_AUTO_PLAY, failed: false, advance, stopAndLeave };
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

function setup(autoPlay: AutoPlayPreference, position = 1180) {
  const stopAndLeave = vi.fn(async (destination: () => void) => {
    destination();
    return true;
  });
  const advance = vi.fn<(next: NextEpisode) => void>();
  const props = { next, snapshot: { ...snapshot, positionSeconds: position }, autoPlay, failed: false, advance, stopAndLeave };
  return { ...renderHook(() => useAutoPlayCountdown(props)), advance, stopAndLeave };
}

it.each([5, 15] as const)("counts %i seconds, then advances once", async (seconds) => {
  const { result, advance } = setup({ enabled: true, countdownSeconds: seconds }, 1190);
  expect(result.current.shown).toBe(true);
  expect(result.current.secondsLeft).toBe(seconds);
  for (let left = seconds - 1; left >= 0; left -= 1) {
    expect(advance).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(left);
  }
  await act(async () => {
    await Promise.resolve();
  });
  expect(advance).toHaveBeenCalledTimes(1);
});

it("with auto-play off shows the card without a countdown and never advances by itself", async () => {
  const { result, advance, stopAndLeave } = setup({ enabled: false, countdownSeconds: 10 });
  expect(result.current.shown).toBe(true);
  expect(result.current.secondsLeft).toBeUndefined();
  act(() => vi.advanceTimersByTime(20_000));
  await act(async () => {
    await Promise.resolve();
  });
  expect(stopAndLeave).not.toHaveBeenCalled();
  expect(advance).not.toHaveBeenCalled();
});

it("with auto-play off hides the card before the window", () => {
  const { result } = setup({ enabled: false, countdownSeconds: 10 }, 100);
  expect(result.current.shown).toBe(false);
});

it("with auto-play off Play now still advances once, and Hide removes the card", async () => {
  const { result, advance } = setup({ enabled: false, countdownSeconds: 10 });
  act(() => result.current.playNow());
  await act(async () => {
    await Promise.resolve();
  });
  expect(advance).toHaveBeenCalledTimes(1);
  expect(advance).toHaveBeenCalledWith(next);

  const hidden = setup({ enabled: false, countdownSeconds: 10 });
  act(() => hidden.result.current.hide());
  expect(hidden.result.current.shown).toBe(false);
  expect(hidden.result.current.dismissed).toBe(true);
});

// One second per act: each tick re-renders and sets the next timeout.
function tickSeconds(count: number) {
  for (let i = 0; i < count; i += 1) act(() => vi.advanceTimersByTime(1000));
}

function liveSetup(initial: AutoPlayPreference) {
  const stopAndLeave = vi.fn(async (destination: () => void) => {
    destination();
    return true;
  });
  const advance = vi.fn<(next: NextEpisode) => void>();
  const base = { next, snapshot: { ...snapshot, positionSeconds: 1190 }, failed: false, advance, stopAndLeave };
  const hook = renderHook((autoPlay: AutoPlayPreference) => useAutoPlayCountdown({ ...base, autoPlay }), { initialProps: initial });
  return { ...hook, advance, stopAndLeave };
}

it("turning auto-play off while counting stops the countdown and keeps the card, then back on counts from the full length", () => {
  const { result, rerender } = liveSetup({ enabled: true, countdownSeconds: 10 });
  tickSeconds(3);
  expect(result.current.secondsLeft).toBe(7);
  rerender({ enabled: false, countdownSeconds: 10 });
  expect(result.current.secondsLeft).toBeUndefined();
  expect(result.current.totalSeconds).toBeUndefined();
  expect(result.current.shown).toBe(true);
  rerender({ enabled: true, countdownSeconds: 10 });
  expect(result.current.secondsLeft).toBe(10);
  expect(result.current.totalSeconds).toBe(10);
});

it("changing the Countdown while counting restarts at the new length", () => {
  const { result, rerender } = liveSetup({ enabled: true, countdownSeconds: 10 });
  tickSeconds(4);
  rerender({ enabled: true, countdownSeconds: 15 });
  expect(result.current.secondsLeft).toBe(15);
  expect(result.current.totalSeconds).toBe(15);
});

it("Hide ends every countdown for the session, whatever changes after", () => {
  const { result, rerender } = liveSetup({ enabled: true, countdownSeconds: 10 });
  act(() => result.current.hide());
  rerender({ enabled: false, countdownSeconds: 10 });
  rerender({ enabled: true, countdownSeconds: 15 });
  expect(result.current.shown).toBe(false);
  expect(result.current.secondsLeft).toBeUndefined();
});

it("a change after the countdown reached zero does not stop the advance", async () => {
  const { rerender, advance, stopAndLeave } = liveSetup({ enabled: true, countdownSeconds: 5 });
  tickSeconds(5);
  rerender({ enabled: false, countdownSeconds: 5 });
  await act(async () => {
    await Promise.resolve();
  });
  expect(stopAndLeave).toHaveBeenCalledTimes(1);
  expect(advance).toHaveBeenCalledTimes(1);
});
