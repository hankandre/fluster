import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot } from "../../../domain/playback";
import { TransportControls } from "./transport-controls";

afterEach(cleanup);

const snapshot: PlaybackSnapshot = {
  positionSeconds: 10,
  durationSeconds: 100,
  paused: false,
  buffering: false,
  volume: 80,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};

function setup(overrides: Partial<Parameters<typeof TransportControls>[0]> = {}) {
  const handlers = {
    onTogglePause: vi.fn(),
    onSeekBy: vi.fn(),
    onToggleMute: vi.fn(),
    onVolume: vi.fn(),
    onToggleChapters: vi.fn(),
    onToggleTracks: vi.fn(),
    onToggleInfo: vi.fn(),
    onToggleFullscreen: vi.fn(),
  };
  render(
    <TransportControls snapshot={snapshot} fullscreen={false} tracksOpen={false} infoOpen={false} tracksId="tracks" infoId="info" {...handlers} {...overrides} />,
  );
  return handlers;
}

describe("TransportControls", () => {
  it("has the controls in order, with no Chapters button", () => {
    setup();
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Pause",
      "Back 10 seconds",
      "Forward 10 seconds",
      "Mute",
      "Audio & Subtitles",
      "Info",
      "Enter fullscreen",
    ]);
  });

  it("puts Chapters first in the right-hand group when the item has chapters, and wires it", () => {
    const handlers = setup({ chapters: true, chaptersOpen: true, chaptersId: "chapters" });
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Pause",
      "Back 10 seconds",
      "Forward 10 seconds",
      "Mute",
      "Chapters",
      "Audio & Subtitles",
      "Info",
      "Enter fullscreen",
    ]);
    const chapters = screen.getByRole("button", { name: "Chapters" });
    expect(chapters).toHaveAttribute("aria-expanded", "true");
    expect(chapters).toHaveAttribute("aria-controls", "chapters");
    fireEvent.click(chapters);
    expect(handlers.onToggleChapters).toHaveBeenCalledTimes(1);
    cleanup();
    setup({ chapters: true });
    expect(screen.getByRole("button", { name: "Chapters" })).not.toHaveAttribute("aria-controls");
    cleanup();
    setup({ chapters: true, snapshot: undefined });
    expect(screen.getByRole("button", { name: "Chapters" })).toBeDisabled();
  });

  it("calls the matching handler for each button", () => {
    const handlers = setup();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Back 10 seconds" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    fireEvent.click(screen.getByRole("button", { name: "Audio & Subtitles" }));
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    expect(handlers.onSeekBy.mock.calls).toEqual([[-10], [10]]);
    for (const name of ["onTogglePause", "onToggleMute", "onToggleTracks", "onToggleInfo", "onToggleFullscreen"] as const) {
      expect(handlers[name]).toHaveBeenCalledTimes(1);
    }
  });

  it("commits the volume on pointer-up, not while dragging", () => {
    const handlers = setup();
    const volume = screen.getByRole("slider", { name: "Volume" });
    fireEvent.change(volume, { target: { value: "35" } });
    expect(handlers.onVolume).not.toHaveBeenCalled();
    fireEvent.pointerUp(volume);
    expect(handlers.onVolume).toHaveBeenCalledWith(35);
  });

  it("reflects the open sheet with aria-expanded and points aria-controls at it only while open", () => {
    setup({ tracksOpen: true });
    const tracks = screen.getByRole("button", { name: "Audio & Subtitles" });
    expect(tracks).toHaveAttribute("aria-expanded", "true");
    expect(tracks).toHaveAttribute("aria-controls", "tracks");
    const info = screen.getByRole("button", { name: "Info" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(info).not.toHaveAttribute("aria-controls");
  });

  it("names Play, Unmute, and Exit fullscreen from the state, and disables what needs a snapshot", () => {
    setup({ snapshot: { ...snapshot, paused: true, muted: true }, fullscreen: true });
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Unmute" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeEnabled();
    cleanup();
    setup({ snapshot: undefined });
    expect(screen.getByRole("button", { name: "Audio & Subtitles" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Info" })).toBeEnabled();
  });
});

describe("TransportControls in the TV form", () => {
  afterEach(() => {
    delete document.documentElement.dataset.form;
  });

  it("centres back, Play or Pause, and forward, with Audio & Subtitles and Info, and no volume or Fullscreen", () => {
    document.documentElement.dataset.form = "tv";
    setup();
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Back 10 seconds",
      "Pause",
      "Forward 10 seconds",
      "Audio & Subtitles",
      "Info",
    ]);
    expect(screen.queryByLabelText("Volume")).toBeNull();
  });

  it("puts Chapters before Audio & Subtitles when the item has chapters, and omits it otherwise", () => {
    document.documentElement.dataset.form = "tv";
    setup({ chapters: true });
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Back 10 seconds",
      "Pause",
      "Forward 10 seconds",
      "Chapters",
      "Audio & Subtitles",
      "Info",
    ]);
  });
});
