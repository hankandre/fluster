import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { focusChromeControl, useTvChromeFocus } from "./use-tv-chrome-focus";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
});

function Chrome() {
  const region = useRef<HTMLElement>(null);
  useTvChromeFocus(region);
  return (
    <section ref={region} aria-label="Player" tabIndex={-1}>
      <header className="player-top-bar">
        <button type="button">Back</button>
        <button type="button">Chip</button>
      </header>
      <input type="range" aria-label="Playback position" />
      <div className="control-row">
        <button type="button">Rewind</button>
        <button type="button" data-role="play">Play</button>
        <button type="button">Forward</button>
        <button type="button">Tracks</button>
      </div>
      <div className="player-prompt"><button type="button">Play now</button><button type="button">Hide</button></div>
    </section>
  );
}

const button = (name: string) => screen.getByRole("button", { name });
const scrubber = () => screen.getByRole("slider", { name: "Playback position" });

describe("useTvChromeFocus", () => {
  it("moves Up and Down through top bar, scrubber, control row, and prompt", () => {
    document.documentElement.dataset.form = "tv";
    render(<Chrome />);
    button("Back").focus();
    fireEvent.keyDown(button("Back"), { key: "ArrowDown" });
    expect(scrubber()).toHaveFocus();
    expect(fireEvent.keyDown(scrubber(), { key: "ArrowDown" })).toBe(false);
    expect(button("Play")).toHaveFocus();
    fireEvent.keyDown(button("Play"), { key: "ArrowDown" });
    expect(button("Play now")).toHaveFocus();
    fireEvent.keyDown(button("Play now"), { key: "ArrowUp" });
    expect(button("Play")).toHaveFocus();
    fireEvent.keyDown(button("Play"), { key: "ArrowUp" });
    expect(scrubber()).toHaveFocus();
    fireEvent.keyDown(scrubber(), { key: "ArrowUp" });
    expect(button("Back")).toHaveFocus();
  });

  it("remembers the last control of a zone", () => {
    document.documentElement.dataset.form = "tv";
    render(<Chrome />);
    button("Play").focus();
    fireEvent.keyDown(button("Play"), { key: "ArrowRight" });
    expect(button("Forward")).toHaveFocus();
    fireEvent.keyDown(button("Forward"), { key: "ArrowUp" });
    fireEvent.keyDown(scrubber(), { key: "ArrowDown" });
    expect(button("Forward")).toHaveFocus();
  });

  it("moves Left and Right inside the top bar and leaves the scrubber to seek", () => {
    document.documentElement.dataset.form = "tv";
    render(<Chrome />);
    button("Back").focus();
    fireEvent.keyDown(button("Back"), { key: "ArrowRight" });
    expect(button("Chip")).toHaveFocus();
    scrubber().focus();
    expect(fireEvent.keyDown(scrubber(), { key: "ArrowRight" })).toBe(true);
    expect(scrubber()).toHaveFocus();
  });

  it("does nothing on desktop", () => {
    render(<Chrome />);
    button("Back").focus();
    expect(fireEvent.keyDown(button("Back"), { key: "ArrowDown" })).toBe(true);
    expect(button("Back")).toHaveFocus();
  });

  it("focusChromeControl focuses the scrubber or Play or Pause", () => {
    render(<Chrome />);
    const root = screen.getByRole("region", { name: "Player" });
    focusChromeControl(root, "play");
    expect(button("Play")).toHaveFocus();
    focusChromeControl(root, "scrubber");
    expect(scrubber()).toHaveFocus();
  });
});
