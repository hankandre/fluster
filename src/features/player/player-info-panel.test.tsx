import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { PlaybackSnapshot, PlayerCapabilities } from "../../domain/playback";
import { PlayerInfoPanel } from "./player-info-panel";
import type { ReadyPlayerStatus } from "./player-status";

afterEach(cleanup);

const nativeCapabilities: PlayerCapabilities = {
  mode: "native",
  embedded: true,
  renderer: "OpenGL",
  nativeRenderer: "gl",
  libmpvVersion: "mpv 0.38.0",
};

const nativeStatus: ReadyPlayerStatus = { kind: "ready", capabilities: nativeCapabilities };

const snapshot: PlaybackSnapshot = {
  positionSeconds: 1,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: {
    decodeMode: "hardware",
    decodeLabel: "Hardware decoding",
    hwdecCurrent: "vaapi",
    hwdecInterop: "vaapi-egl",
    droppedFrames: 0,
  },
};

function panel() {
  return screen.getByLabelText("Player information");
}

describe("PlayerInfoPanel", () => {
  it("is closed until the Info button opens it", async () => {
    render(<PlayerInfoPanel status={nativeStatus} snapshot={snapshot} />);
    const button = screen.getByRole("button", { name: "Info" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeVisible();

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel()).toBeVisible();
  });

  it("shows the libmpv version, renderer, decode mode, hwdec, and play method", () => {
    render(<PlayerInfoPanel status={nativeStatus} snapshot={snapshot} />);
    fireEvent.keyDown(window, { key: "i" });
    expect(panel()).toHaveTextContent("Native, libmpv mpv 0.38.0");
    expect(panel()).toHaveTextContent("OpenGL");
    expect(panel()).toHaveTextContent("Hardware decoding");
    expect(panel()).toHaveTextContent("vaapi via vaapi-egl");
    expect(panel()).toHaveTextContent("Direct play");
  });

  it("labels the browser player unverified", () => {
    const status: ReadyPlayerStatus = {
      kind: "ready",
      capabilities: { mode: "browser", embedded: true, renderer: "html-video", nativeRenderer: "browser-html-video" },
    };
    render(<PlayerInfoPanel status={status} snapshot={undefined} />);
    expect(panel()).toHaveTextContent("Browser — unverified");
    expect(panel()).toHaveTextContent("Not playing yet");
  });

  it("names the play method it is given", () => {
    render(<PlayerInfoPanel status={nativeStatus} snapshot={snapshot} playMethod="Transcode" />);
    expect(panel()).toHaveTextContent("Transcode");
  });

  it("never shows URLs, tokens, or ids that reach it", () => {
    const leaky: PlaybackSnapshot = {
      ...snapshot,
      diagnostics: {
        ...snapshot.diagnostics,
        decodeLabel: "https://media.test/Videos/m1/stream?api_key=SECRET-TOKEN&PlaySessionId=play-9",
        hwdecCurrent: "api_key=SECRET-TOKEN",
        hwdecInterop: "PlaySessionId=play-9",
      },
    };
    render(<PlayerInfoPanel status={nativeStatus} snapshot={leaky} />);
    const text = panel().textContent ?? "";
    expect(text).not.toContain("SECRET-TOKEN");
    expect(text).not.toContain("play-9");
    expect(text).not.toContain("media.test");
    expect(text).not.toContain("://");
  });

  it("toggles with the i key, but not while typing or with a modifier", () => {
    render(
      <>
        <input aria-label="Field" />
        <input aria-label="Seek" type="range" />
        <PlayerInfoPanel status={nativeStatus} snapshot={snapshot} />
      </>,
    );
    expect(panel()).not.toBeVisible();
    fireEvent.keyDown(window, { key: "i" });
    expect(panel()).toBeVisible();
    fireEvent.keyDown(screen.getByLabelText("Field"), { key: "i" });
    expect(panel()).toBeVisible();
    fireEvent.keyDown(screen.getByLabelText("Seek"), { key: "i" });
    expect(panel()).not.toBeVisible();
    fireEvent.keyDown(window, { key: "i" });
    expect(panel()).toBeVisible();
    fireEvent.keyDown(window, { key: "i", ctrlKey: true });
    expect(panel()).toBeVisible();
    fireEvent.keyDown(window, { key: "I" });
    expect(panel()).not.toBeVisible();
  });
});
