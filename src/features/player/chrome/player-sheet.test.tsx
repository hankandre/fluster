import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerSheet } from "./player-sheet";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PlayerSheet", () => {
  // The sheet mounts off the right edge while it slides in. A scrolling focus would scroll the
  // clipped player page sideways, so the sheet overshoots and the page jumps until the slide ends.
  it("moves focus into the sheet on open without scrolling the page", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(
      <PlayerSheet label="Audio and subtitles" title="Audio & Subtitles" onClose={() => {}}>
        <button type="button">English</button>
      </PlayerSheet>,
    );
    const option = screen.getByRole("button", { name: "English" });
    expect(option).toHaveFocus();
    const call = focus.mock.calls.find((_, index) => focus.mock.contexts[index] === option);
    expect(call).toEqual([{ preventScroll: true }]);
  });

  it("focuses Close without scrolling when asked to", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(
      <PlayerSheet label="Information" title="Information" onClose={() => {}} initialFocus="close">
        <p>Details</p>
      </PlayerSheet>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    const call = focus.mock.calls.find((_, index) => focus.mock.contexts[index] === close);
    expect(call).toEqual([{ preventScroll: true }]);
  });
});
