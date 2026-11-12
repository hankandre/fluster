import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot, PlayerEngine } from "../domain/playback";
import { conversionIndicator } from "../features/player/conversion-copy";
import type { ReadyPlayerStatus } from "../features/player/player-status";
import { CHROME_IDLE_MS } from "../features/player/chrome/timing";
import type { PlaybackSessionState } from "../lib/player/session-state";
import { PlayerView } from "./PlayerView";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const status: ReadyPlayerStatus = {
  kind: "ready",
  capabilities: { mode: "native", embedded: true, renderer: "OpenGL", nativeRenderer: "gl", libmpvVersion: "mpv 0.38.0" },
};

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
      status={status}
      session={{
        snapshot,
        firstFrameReady: true,
      } satisfies PlaybackSessionState}
      onRetry={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading", { name: "Original Movie" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Info" }));
  expect(screen.getByRole("region", { name: "Player information" })).toHaveTextContent("Hardware — VA-API");
  fireEvent.click(screen.getByRole("button", { name: "Audio & Subtitles" }));
  expect(screen.getByRole("option", { name: "English 5.1" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Player information" })).not.toBeInTheDocument();
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
      status={status}
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
    <PlayerView item={movie} player={fakePlayer()} status={status} session={{ snapshot, firstFrameReady: true }} onRetry={vi.fn()} onBack={vi.fn()} />,
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
      status={status}
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
      status={status}
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
        status={status}
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

  it("Escape closes the open track panel and does not leave the player", () => {
    const { onBack } = renderShortcuts({ tracks: subtitles });
    fireEvent.keyDown(document.body, { key: "a" });
    const row = within(screen.getByRole("listbox", { name: "Subtitle track" })).getAllByRole("option")[0];
    fireEvent.keyDown(row, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Audio and subtitles" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(1);
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

function renderView(overrides: Partial<PlaybackSnapshot> = {}, props: Partial<Parameters<typeof PlayerView>[0]> = {}) {
  const player = fakePlayer();
  const onBack = vi.fn();
  const view = render(
    <PlayerView
      item={movie}
      player={player}
      status={status}
      session={{ snapshot: { ...snapshot, paused: false, ...overrides }, firstFrameReady: true }}
      onRetry={vi.fn()}
      onBack={onBack}
      {...props}
    />,
  );
  return { player, onBack, ...view };
}

const osd = () => screen.getByRole("status", { name: "Player message" });
const loadingStatus = () => screen.getByRole("status", { name: "Player status" });
const press = (key: string) => act(() => void fireEvent.keyDown(document.body, { key }));

describe("on-screen feedback for keys", () => {
  it.each([
    ["ArrowRight", "+10 s"],
    ["l", "+10 s"],
    ["ArrowLeft", "−10 s"],
    ["j", "−10 s"],
    ["ArrowUp", "Volume 75%"],
    ["ArrowDown", "Volume 65%"],
    ["m", "Muted"],
    ["Home", "Start"],
    ["End", "End"],
    ["0", "Start"],
    ["3", "30%"],
    ["9", "90%"],
  ])("%s shows %s", (key, text) => {
    renderView({ volume: 70, positionSeconds: 100, durationSeconds: 3600 });
    press(key);
    expect(osd()).toHaveTextContent(text);
  });

  it("unmuting shows the volume", () => {
    renderView({ muted: true, volume: 40 });
    press("m");
    expect(osd()).toHaveTextContent("Volume 40%");
  });

  it("c names the subtitle it switches to, off, or that there are none", () => {
    const subtitles: PlaybackSnapshot["tracks"] = [
      { playerId: 3, type: "Subtitle", title: "English (SDH)", external: false, selected: false },
      { playerId: 4, type: "Subtitle", title: "French", external: false, selected: false },
    ];
    renderView({ tracks: subtitles });
    press("c");
    expect(osd()).toHaveTextContent("Subtitles: English (SDH)");
    cleanup();
    renderView({ tracks: subtitles.map((track, index) => ({ ...track, selected: index === 1 })) });
    press("c");
    expect(osd()).toHaveTextContent("Subtitles: Off");
    cleanup();
    renderView({ tracks: [] });
    press("c");
    expect(osd()).toHaveTextContent("No subtitles");
  });

  it("shows nothing for Space, f, i, or a", () => {
    renderView();
    for (const key of [" ", "f", "i", "a"]) press(key);
    expect(osd()).toBeEmptyDOMElement();
  });

  it("shows the message whether or not the chrome is visible", () => {
    vi.useFakeTimers();
    renderView();
    fireEvent.mouseMove(screen.getByRole("region", { name: "Player" }), { clientX: 3, clientY: 3 });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(document.querySelector(".player-chrome")).toHaveAttribute("data-visible", "false");
    press("m");
    expect(osd()).toHaveTextContent("Muted");
    act(() => vi.advanceTimersByTime(2_000));
    expect(osd()).toBeEmptyDOMElement();
  });
});

describe("jumps to a share of the file", () => {
  it("Home seeks to the start, End to the duration, and a digit to its tenth", () => {
    const { player } = renderView({ positionSeconds: 100, durationSeconds: 3600 });
    press("Home");
    press("End");
    press("3");
    expect(vi.mocked(player.seek).mock.calls.map(([seconds]) => seconds)).toEqual([0, 3600, 1080]);
  });

  it("seeks to the start without a duration, but nothing else", () => {
    const { player } = renderView({ durationSeconds: undefined });
    press("End");
    press("5");
    expect(player.seek).not.toHaveBeenCalled();
    press("Home");
    expect(player.seek).toHaveBeenCalledWith(0);
  });

  it("leaves Home and End to a focused slider", () => {
    const { player } = renderView();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Playback position" }), { key: "Home" });
    expect(player.seek).not.toHaveBeenCalled();
  });
});

describe("chrome visibility", () => {
  const chrome = () => document.querySelector(".player-chrome");

  it("stays up while paused and while a sheet is open, and hides three seconds after the last pointer move", () => {
    vi.useFakeTimers();
    const { rerender, player } = renderView({ paused: true });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 3));
    expect(chrome()).toHaveAttribute("data-visible", "true");
    rerender(
      <PlayerView item={movie} player={player} status={status} session={{ snapshot: { ...snapshot, paused: false }, firstFrameReady: true }} onRetry={vi.fn()} onBack={vi.fn()} />,
    );
    fireEvent.mouseMove(screen.getByRole("region", { name: "Player" }), { clientX: 6, clientY: 6 });
    press("i");
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 3));
    expect(chrome()).toHaveAttribute("data-visible", "true");
    press("i");
    fireEvent.mouseMove(screen.getByRole("region", { name: "Player" }), { clientX: 9, clientY: 9 });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(chrome()).toHaveAttribute("data-visible", "false");
    fireEvent.mouseMove(screen.getByRole("region", { name: "Player" }), { clientX: 12, clientY: 12 });
    expect(chrome()).toHaveAttribute("data-visible", "true");
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(chrome()).toHaveAttribute("data-visible", "false");
  });

  it("stays up while a control has keyboard focus", () => {
    vi.useFakeTimers();
    renderView();
    fireEvent.mouseMove(screen.getByRole("region", { name: "Player" }), { clientX: 15, clientY: 15 });
    act(() => screen.getByRole("button", { name: "Mute" }).focus());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 3));
    expect(chrome()).toHaveAttribute("data-visible", "true");
  });

  it("draws no controls before the first frame, only the loading screen with Back", () => {
    renderView({}, { session: { snapshot, firstFrameReady: false } });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Original Movie", level: 1 })).toBeInTheDocument();
    expect(loadingStatus()).toHaveTextContent("Loading…");
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});

describe("loading text", () => {
  const converted = conversionIndicator({ delivery: "hls", playMethod: "Transcode", conversionReasons: ["ContainerBitrateExceedsLimit"] } as never);

  it("claims nothing before the server has answered, names the original file for a static plan, and the conversion otherwise", () => {
    const session = { snapshot: undefined, firstFrameReady: false };
    const { rerender, player } = renderView({}, { session });
    expect(loadingStatus()).toHaveTextContent("Loading…");
    const again = (props: Partial<Parameters<typeof PlayerView>[0]>) => rerender(
      <PlayerView item={movie} player={player} status={status} session={session} onRetry={vi.fn()} onBack={vi.fn()} {...props} />,
    );
    again({ playMethod: "DirectPlay" });
    expect(loadingStatus()).toHaveTextContent("Opening the original file…");
    again({ playMethod: "Transcode", indicator: converted });
    expect(loadingStatus()).toHaveTextContent("Converting on server: the file is over your streaming limit…");
  });
});

describe("conversion notice", () => {
  const converted = conversionIndicator({ delivery: "hls", playMethod: "Transcode", conversionReasons: ["ContainerBitrateExceedsLimit"], subtitlesBurnedIn: true } as never);

  it("shows the chip and the OSD line at the first frame, and again after a reset", () => {
    const { rerender, player } = renderView({}, { indicator: converted, playMethod: "Transcode" });
    const line = "Converting on server: the file is over your streaming limit · Subtitles are burned in";
    expect(osd()).toHaveTextContent(line);
    expect(screen.getByRole("button", { name: /Converting on server/ })).toBeInTheDocument();
    const withSession = (firstFrameReady: boolean) => rerender(
      <PlayerView item={movie} player={player} status={status} session={{ snapshot, firstFrameReady }} indicator={converted} playMethod="Transcode" onRetry={vi.fn()} onBack={vi.fn()} />,
    );
    act(() => void withSession(false));
    act(() => void withSession(true));
    expect(osd()).toHaveTextContent(line);
  });

  it("shows nothing for direct play", () => {
    renderView({}, { playMethod: "DirectPlay" });
    expect(screen.queryByRole("button", { name: /Converting|Repackaging/ })).not.toBeInTheDocument();
    expect(osd()).toBeEmptyDOMElement();
  });

  it("the chip opens the Info sheet with focus on Play original", () => {
    renderView({}, {
      indicator: converted,
      playMethod: "Transcode",
      playOriginal: { available: true, stillConverting: false, onPlay: vi.fn() },
    });
    fireEvent.click(screen.getByRole("button", { name: /Converting on server/ }));
    expect(screen.getByRole("region", { name: "Player information" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play original" })).toHaveFocus();
  });
});

describe("sheets", () => {
  it("the Info button and the i key open and close the Info sheet; modifiers and text fields do not", () => {
    renderView();
    const button = screen.getByRole("button", { name: "Info" });
    const sheet = () => screen.queryByRole("region", { name: "Player information" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAttribute("aria-controls");
    expect(sheet()).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", sheet()?.id);
    fireEvent.click(button);
    expect(sheet()).not.toBeInTheDocument();
    press("i");
    expect(sheet()).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "i", ctrlKey: true });
    expect(sheet()).toBeInTheDocument();
    press("I");
    expect(sheet()).not.toBeInTheDocument();
  });

  it("i works from the slider but not from a text field", () => {
    renderView();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), { key: "i" });
    expect(screen.getByRole("region", { name: "Player information" })).toBeInTheDocument();
    const field = document.body.appendChild(document.createElement("input"));
    fireEvent.keyDown(field, { key: "i" });
    expect(screen.getByRole("region", { name: "Player information" })).toBeInTheDocument();
    field.remove();
  });

  it("opens one sheet at a time, and Escape closes the sheet before leaving", () => {
    const { onBack } = renderView();
    press("a");
    expect(screen.getByRole("region", { name: "Audio and subtitles" })).toBeInTheDocument();
    press("i");
    expect(screen.queryByRole("region", { name: "Audio and subtitles" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Player information" })).toBeInTheDocument();
    press("Escape");
    expect(screen.queryByRole("region", { name: "Player information" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    press("Escape");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the control that opened the sheet when it closes", () => {
    renderView();
    const button = screen.getByRole("button", { name: "Audio & Subtitles" });
    button.focus();
    fireEvent.click(button);
    expect(button).not.toHaveFocus();
    press("Escape");
    expect(button).toHaveFocus();
  });

  it("claims neither the method nor the original file in Info before the server has answered", () => {
    renderView();
    press("i");
    const info = screen.getByRole("region", { name: "Player information" });
    expect(info).not.toHaveTextContent("Original file");
    expect(info).not.toHaveTextContent("Direct play");
  });

  it("names the original file in Info once the plan says direct play", () => {
    renderView({}, { playMethod: "DirectPlay" });
    press("i");
    expect(screen.getByRole("region", { name: "Player information" })).toHaveTextContent("Original file");
  });

  it("the track panel lists direct-play tracks and a choice reaches the player", () => {
    const { player } = renderView({
      tracks: [
        { playerId: 2, type: "Audio", title: "English 5.1", external: false, selected: true },
        { playerId: 5, type: "Audio", title: "French", external: false, selected: false },
      ],
    });
    press("a");
    const audio = screen.getByRole("listbox", { name: "Audio track" });
    expect(within(audio).getByRole("option", { name: "English 5.1" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(within(audio).getByRole("option", { name: "French" }));
    expect(player.selectTrack).toHaveBeenCalledWith("audio", 5);
    expect(screen.getByRole("region", { name: "Audio and subtitles" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Subtitle track" })).getByRole("option", { name: "Subtitles off" }));
    expect(player.selectTrack).toHaveBeenLastCalledWith("subtitle", undefined);
  });

  it("shows the elapsed and remaining time and the Back, Forward, and Info buttons", () => {
    const { player } = renderView({ positionSeconds: 60, durationSeconds: 3600 });
    expect(screen.getByText("1:00")).toBeInTheDocument();
    expect(screen.getByText(/−59:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    fireEvent.click(screen.getByRole("button", { name: "Back 10 seconds" }));
    expect(vi.mocked(player.seek).mock.calls.map(([seconds]) => seconds)).toEqual([70, 50]);
  });
});
