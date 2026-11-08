import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
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

const movie = { id: "movie", name: "Original Movie", type: "Movie" as const, resumePositionTicks: 0, played: false };

function seekTrack(container: HTMLElement): HTMLElement {
  return container.querySelector(".seek-track") as HTMLElement;
}

it("renders the bare seek slider when no preview or chapters are passed", () => {
  const { container } = render(
    <PlayerView item={movie} player={fakePlayer()} session={{ snapshot, firstFrameReady: true }} onRetry={vi.fn()} onBack={vi.fn()} />,
  );
  const slider = screen.getByRole("slider", { name: "Playback position" });
  expect(slider.parentElement).toHaveClass("seek-row");
  expect(container.querySelector(".seek-track, .seek-preview, .seek-chapter")).toBeNull();
  fireEvent.pointerMove(slider, { clientX: 100 });
  expect(container.querySelector(".seek-preview")).toBeNull();
});

it("shows a preview with time and chapter name on hover, and chapter markers", () => {
  const { container } = render(
    <PlayerView
      item={movie}
      player={fakePlayer()}
      session={{ snapshot, firstFrameReady: true }}
      onRetry={vi.fn()}
      onBack={vi.fn()}
      seekPreview={(seconds) => <div data-testid="thumb">{seconds}</div>}
      chapters={[{ startSeconds: 0, name: "Opening" }, { startSeconds: 900, name: "Contact" }, { startSeconds: 2700, name: "Ending" }]}
    />,
  );
  // The opening chapter has no marker; the others sit at their share of 3600 s.
  expect(screen.getAllByRole("img").map((marker) => marker.getAttribute("aria-label"))).toEqual([
    "Chapter: Contact at 15:00",
    "Chapter: Ending at 45:00",
  ]);
  expect(screen.getByRole("img", { name: "Chapter: Contact at 15:00" })).toHaveStyle({ left: "25%" });
  expect(container.querySelector(".seek-preview")).toBeNull();

  const track = seekTrack(container);
  track.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, right: 500, bottom: 10, height: 10, x: 100, y: 0, toJSON: () => ({}) });
  // jsdom has no PointerEvent, so send a mouse event of the pointer type.
  fireEvent(track, new MouseEvent("pointermove", { bubbles: true, clientX: 300 }));
  const preview = container.querySelector(".seek-preview") as HTMLElement;
  expect(preview).toHaveTextContent("30:00");
  expect(preview).toHaveTextContent("Contact");
  expect(screen.getByTestId("thumb")).toHaveTextContent("1800");

  fireEvent.pointerLeave(track);
  expect(container.querySelector(".seek-preview")).toBeNull();
});

it("shows the preview at the keyboard position while the seek bar has focus", () => {
  const { container } = render(
    <PlayerView
      item={movie}
      player={fakePlayer()}
      session={{ snapshot, firstFrameReady: true }}
      onRetry={vi.fn()}
      onBack={vi.fn()}
      seekPreview={(seconds) => <div data-testid="thumb">{seconds}</div>}
    />,
  );
  const slider = screen.getByRole("slider", { name: "Playback position" });
  fireEvent.focus(slider);
  expect(screen.getByTestId("thumb")).toHaveTextContent("42");
  fireEvent.change(slider, { target: { value: "52" } });
  expect(screen.getByTestId("thumb")).toHaveTextContent("52");
  fireEvent.blur(slider);
  expect(container.querySelector(".seek-preview")).toBeNull();
});

describe("keyboard shortcuts", () => {
  const subtitles: PlaybackSnapshot["tracks"] = [
    { playerId: 3, type: "Subtitle", title: "English", external: false, selected: false },
    { playerId: 4, type: "Subtitle", title: "French", external: false, selected: true },
  ];

  function renderShortcuts(overrides: Partial<PlaybackSnapshot> = {}) {
    const player = fakePlayer();
    const onBack = vi.fn();
    render(
      <PlayerView
        item={movie}
        player={player}
        session={{ snapshot: { ...snapshot, ...overrides }, firstFrameReady: true }}
        onRetry={vi.fn()}
        onBack={onBack}
      />,
    );
    return { player, onBack };
  }

  it("plays and pauses with Space and K", () => {
    const { player } = renderShortcuts();
    fireEvent.keyDown(document.body, { key: " " });
    fireEvent.keyDown(document.body, { key: "k" });
    expect(player.setPaused).toHaveBeenCalledTimes(2);
    expect(player.setPaused).toHaveBeenCalledWith(false);
  });

  it("seeks ten seconds with the arrows and J/L, within the file", () => {
    const { player } = renderShortcuts({ positionSeconds: 5, durationSeconds: 3600 });
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "l" });
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    fireEvent.keyDown(document.body, { key: "j" });
    expect(vi.mocked(player.seek).mock.calls.map(([seconds]) => seconds)).toEqual([15, 15, 0, 0]);
  });

  it("does not seek past the end", () => {
    const { player } = renderShortcuts({ positionSeconds: 3595, durationSeconds: 3600 });
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(player.seek).toHaveBeenCalledWith(3600);
  });

  it("changes volume with Up and Down, within 0 to 100, and mutes with M", () => {
    const { player } = renderShortcuts({ volume: 98 });
    fireEvent.keyDown(document.body, { key: "ArrowUp" });
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.body, { key: "m" });
    expect(vi.mocked(player.setVolume).mock.calls.map(([volume]) => volume)).toEqual([100, 93]);
    expect(player.setMuted).toHaveBeenCalledWith(true);
  });

  it("cycles subtitles with C, ending at off", () => {
    const { player } = renderShortcuts({ tracks: subtitles });
    fireEvent.keyDown(document.body, { key: "c" });
    expect(player.selectTrack).toHaveBeenLastCalledWith("subtitle", undefined);
  });

  it("starts the subtitle cycle at the first track", () => {
    const { player } = renderShortcuts({ tracks: subtitles.map((track) => ({ ...track, selected: false })) });
    fireEvent.keyDown(document.body, { key: "c" });
    expect(player.selectTrack).toHaveBeenLastCalledWith("subtitle", 3);
  });

  it("does nothing with C when there are no subtitles", () => {
    const { player } = renderShortcuts();
    fireEvent.keyDown(document.body, { key: "c" });
    expect(player.selectTrack).not.toHaveBeenCalled();
  });

  it("toggles fullscreen with F, and Escape leaves fullscreen before the player", async () => {
    const { player, onBack } = renderShortcuts();
    fireEvent.keyDown(document.body, { key: "f" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeVisible());
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeVisible());
    expect(player.setFullscreen).toHaveBeenLastCalledWith(false);
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("does not leave the player on Escape from a focused track list", () => {
    const { onBack } = renderShortcuts();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Subtitle track" }), { key: "Escape" });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("leaves arrows to a focused slider and Space to a focused button", () => {
    const { player } = renderShortcuts();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Playback position" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Mute" }), { key: " " });
    expect(player.setVolume).not.toHaveBeenCalled();
    expect(player.seek).not.toHaveBeenCalled();
    expect(player.setPaused).not.toHaveBeenCalled();
    // Other shortcuts still work from those controls.
    fireEvent.keyDown(screen.getByRole("button", { name: "Mute" }), { key: "k" });
    expect(player.setPaused).toHaveBeenCalledWith(false);
  });
});
