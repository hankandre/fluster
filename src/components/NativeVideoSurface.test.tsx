import { act, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PlayerEngine, PlayerSurfaceFrame } from "../domain/playback";
import { NativeVideoSurface } from "./NativeVideoSurface";

it("keeps one surface update in flight and sends only the latest pending frame", async () => {
  let resize: ResizeObserverCallback = () => undefined;
  class ControlledResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resize = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  let width = 100;
  const resolveRequests: Array<() => void> = [];
  const player = fakePlayer();
  vi.mocked(player.setSurface).mockImplementation(() => new Promise<void>((resolve) => {
    resolveRequests.push(resolve);
  }));
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    x: 10,
    y: 20,
    width,
    height: 80,
    top: 20,
    right: 10 + width,
    bottom: 100,
    left: 10,
    toJSON: () => ({}),
  }));

  const view = render(<NativeVideoSurface player={player} onError={vi.fn()} />);
  expect(player.setSurface).toHaveBeenCalledTimes(1);

  width = 200;
  resize([], {} as ResizeObserver);
  width = 300;
  resize([], {} as ResizeObserver);
  expect(player.setSurface).toHaveBeenCalledTimes(1);

  await act(async () => resolveRequests[0]());
  await waitFor(() => expect(player.setSurface).toHaveBeenCalledTimes(2));
  expect(player.setSurface).toHaveBeenLastCalledWith(expect.objectContaining({ width: 300 }));

  view.unmount();
  await act(async () => resolveRequests[1]());
  await waitFor(() => expect(player.setSurface).toHaveBeenCalledTimes(3));
  expect(player.setSurface).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("does not let an old mount hide a replacement surface", async () => {
  const player = fakePlayer();
  let width = 100;
  const resolveRequests: Array<() => void> = [];
  vi.mocked(player.setSurface).mockImplementation(() => new Promise<void>((resolve) => {
    resolveRequests.push(resolve);
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    x: 0,
    y: 0,
    width,
    height: 80,
    top: 0,
    right: width,
    bottom: 80,
    left: 0,
    toJSON: () => ({}),
  }));

  const first = render(<NativeVideoSurface player={player} onError={vi.fn()} />);
  first.unmount();
  width = 200;
  render(<NativeVideoSurface player={player} onError={vi.fn()} />);
  await act(async () => resolveRequests[0]());

  await waitFor(() => expect(player.setSurface).toHaveBeenCalledTimes(2));
  expect(player.setSurface).toHaveBeenLastCalledWith(expect.objectContaining({
    visible: true,
    width: 200,
  }));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fakePlayer(): PlayerEngine {
  return {
    mode: "native",
    initialize: vi.fn(),
    subscribe: vi.fn(),
    setSurface: vi.fn<(frame: PlayerSurfaceFrame) => Promise<void>>(),
    launch: vi.fn(),
    setPaused: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    selectTrack: vi.fn(),
    setFullscreen: vi.fn(),
    stop: vi.fn(),
  };
}
