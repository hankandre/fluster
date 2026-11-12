import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot, PlayerCapabilities } from "../../../domain/playback";
import { conversionIndicator } from "../conversion-copy";
import type { ReadyPlayerStatus } from "../player-status";
import { InfoSheet } from "./info-sheet";

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

const noop = () => undefined;

describe("InfoSheet", () => {
  it("shows the libmpv version, renderer, decode mode, hwdec, and play method", () => {
    render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="DirectPlay" onClose={noop} />);
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
    render(<InfoSheet status={status} snapshot={undefined} onClose={noop} />);
    expect(panel()).toHaveTextContent("Browser \u2014 unverified");
    expect(panel()).toHaveTextContent("Not playing yet");
  });

  it("names the play method it is given", () => {
    render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="Transcode" onClose={noop} />);
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
    render(<InfoSheet status={nativeStatus} snapshot={leaky} playMethod="DirectPlay" onClose={noop} />);
    const text = panel().textContent ?? "";
    expect(text).not.toContain("SECRET-TOKEN");
    expect(text).not.toContain("play-9");
    expect(text).not.toContain("media.test");
    expect(text).not.toContain("://");
  });

  it("says Original file for direct play, and nothing about the method before the server has answered", () => {
    const { rerender } = render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="DirectPlay" onClose={noop} />);
    expect(panel()).toHaveTextContent("Original file");
    rerender(<InfoSheet status={nativeStatus} snapshot={undefined} onClose={noop} />);
    expect(panel()).not.toHaveTextContent("Original file");
    expect(panel()).not.toHaveTextContent("Direct play");
    expect(panel()).not.toHaveTextContent("Play method");
  });

  it("gives the reasons and burned-in subtitles for a conversion, and not Original file", () => {
    const indicator = conversionIndicator({
      delivery: "hls",
      playMethod: "Transcode",
      conversionReasons: ["ContainerBitrateExceedsLimit"],
      subtitlesBurnedIn: true,
    } as never);
    render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="Transcode" indicator={indicator} onClose={noop} />);
    expect(panel()).toHaveTextContent("the file is over your streaming limit");
    expect(panel()).toHaveTextContent("Subtitles are burned in");
    expect(panel()).not.toHaveTextContent("Original file");
  });

  describe("Play original", () => {
    it("shows the button when it is offered and calls onPlay once", () => {
      const onPlay = vi.fn();
      render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="Transcode" playOriginal={{ available: true, stillConverting: false, onPlay }} onClose={noop} />);
      fireEvent.click(screen.getByRole("button", { name: "Play original" }));
      expect(onPlay).toHaveBeenCalledTimes(1);
    });

    it("hides the button when it is not offered, and shows the note only while the server still converts", () => {
      const { rerender } = render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="Transcode" playOriginal={{ available: false, stillConverting: false, onPlay: noop }} onClose={noop} />);
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();
      expect(screen.queryByText("The server still converts this.")).not.toBeInTheDocument();
      rerender(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="Transcode" playOriginal={{ available: false, stillConverting: true, onPlay: noop }} onClose={noop} />);
      expect(screen.getByText("The server still converts this.")).toBeInTheDocument();
    });

    it("starts focus on Play original only when asked to, otherwise on Close", () => {
      const offered = { available: true, stillConverting: false, onPlay: noop };
      render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="Transcode" playOriginal={offered} onClose={noop} />);
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
      cleanup();
      render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="Transcode" playOriginal={offered} focusPlayOriginal onClose={noop} />);
      expect(screen.getByRole("button", { name: "Play original" })).toHaveFocus();
    });

    it("moves focus to Close as Play original starts a new session", () => {
      render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="Transcode" playOriginal={{ available: true, stillConverting: false, onPlay: noop }} focusPlayOriginal onClose={noop} />);
      fireEvent.click(screen.getByRole("button", { name: "Play original" }));
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });
  });

  it("closes with the Close button", () => {
    const onClose = vi.fn();
    render(<InfoSheet status={nativeStatus} snapshot={snapshot} playMethod="DirectPlay" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
