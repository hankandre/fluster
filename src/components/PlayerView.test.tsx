import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PlaybackSnapshot, PlayerEngine } from "../domain/playback";
import { PlayerView } from "./PlayerView";
import type { PlaybackSessionState } from "../lib/player/session-state";

const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  durationSeconds: 3600,
  paused: true,
  buffering: false,
  volume: 70,
  muted: false,
  tracks: [
    {
      playerId: 2,
      jellyfinIndex: 7,
      type: "Audio",
      title: "English 5.1",
      language: "eng",
      external: false,
      selected: true,
    },
  ],
  diagnostics: {
    decodeMode: "hardware",
    decodeLabel: "Hardware — VA-API",
    videoCodec: "hevc",
    width: 3840,
    height: 2160,
    droppedFrames: 0,
  },
};

function fakePlayer(): PlayerEngine {
  return {
    mode: "browser",
    initialize: vi.fn(async () => ({
      mode: "native" as const,
      embedded: true,
      renderer: "test",
      nativeRenderer: "test",
    })),
    subscribe: vi.fn(async () => () => undefined),
    setSurface: vi.fn(async () => undefined),
    launch: vi.fn(async () => undefined),
    setPaused: vi.fn(async () => undefined),
    seek: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    setMuted: vi.fn(async () => undefined),
    selectTrack: vi.fn(async () => undefined),
    setFullscreen: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
}

it("renders React controls over the native surface and drives typed player operations", async () => {
  const player = fakePlayer();
  render(
    <PlayerView
      item={{ id: "movie", name: "Original Movie", type: "Movie", resumePositionTicks: 0, played: false }}
      player={player}
      session={{
        snapshot,
        firstFrameReady: true,
      } satisfies PlaybackSessionState}
      onRetry={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading", { name: "Original Movie" })).toBeInTheDocument();
  expect(screen.getByText("Hardware — VA-API")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "English 5.1" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(player.setPaused).toHaveBeenCalledWith(false);
  const volume = screen.getByRole("slider", { name: "Volume" });
  fireEvent.change(volume, { target: { value: "35" } });
  expect(player.setVolume).not.toHaveBeenCalled();
  fireEvent.pointerUp(volume);
  expect(player.setVolume).toHaveBeenCalledWith(35);
  fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeVisible());
});

it("rolls fullscreen state back when the player rejects the change", async () => {
  const player = fakePlayer();
  vi.mocked(player.setFullscreen).mockRejectedValue(new Error("fullscreen unavailable"));
  render(
    <PlayerView
      item={{ id: "movie", name: "Original Movie", type: "Movie", resumePositionTicks: 0, played: false }}
      player={player}
      session={{ snapshot, firstFrameReady: true }}
      onRetry={vi.fn()}
      onBack={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
  await waitFor(() => expect(screen.getByText("fullscreen unavailable")).toBeVisible());
  expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeVisible();
});
