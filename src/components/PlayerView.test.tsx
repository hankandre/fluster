import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PlaybackSnapshot, PlayerEngine } from "../domain/playback";
import { PlayerView } from "./PlayerView";

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
    mode: "native",
    initialize: vi.fn(async () => ({ mode: "native" as const, embedded: true, renderer: "test" })),
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

it("renders React controls over the native surface and drives typed player operations", () => {
  const player = fakePlayer();
  render(
    <PlayerView
      item={{ id: "movie", name: "Original Movie", type: "Movie" }}
      player={player}
      event={{ kind: "loaded", snapshot }}
      firstFrameReady
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading", { name: "Original Movie" })).toBeInTheDocument();
  expect(screen.getByText("Hardware — VA-API")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "English 5.1" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(player.setPaused).toHaveBeenCalledWith(false);
});
