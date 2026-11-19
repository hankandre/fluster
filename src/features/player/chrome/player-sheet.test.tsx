import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function rowsSheet(onClose = () => {}) {
  return (
    <PlayerSheet label="Player settings" title="Settings" onClose={onClose} keyRows>
      <div>
        <button type="button">Back to settings</button>
        <h2 tabIndex={-1}>Playback</h2>
        <button type="button" data-roving-item="" tabIndex={0}>Auto-play</button>
        <button type="button" data-roving-item="" tabIndex={-1}>Countdown</button>
      </div>
    </PlayerSheet>
  );
}

describe("PlayerSheet keyRows", () => {
  it("marks the whole sheet so the keymap lets Up and Down move between rows", () => {
    render(rowsSheet());
    expect(screen.getByRole("region", { name: "Player settings" })).toHaveAttribute("data-key-rows");
  });

  it("steps Down and Up through Close and the focus stops, with preventScroll", async () => {
    const user = userEvent.setup();
    render(rowsSheet());
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Back to settings" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Auto-play" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    // The roving set is one stop: the second row is not reached by the sheet.
    expect(screen.getByRole("button", { name: "Auto-play" })).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(close).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(close).toHaveFocus();
    expect(focus.mock.calls.every((call) => call[0] !== undefined && (call[0] as FocusOptions).preventScroll === true)).toBe(true);
  });

  it("from a focused heading goes Down to the first row and Up to Back", async () => {
    const user = userEvent.setup();
    render(rowsSheet());
    screen.getByRole("heading", { name: "Playback" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Auto-play" })).toHaveFocus();
    screen.getByRole("heading", { name: "Playback" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "Back to settings" })).toHaveFocus();
  });

  it("restores focus to the opener with preventScroll on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(rowsSheet());
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    view.unmount();
    const call = focus.mock.calls.find((_, index) => focus.mock.contexts[index] === opener);
    expect(call).toEqual([{ preventScroll: true }]);
    opener.remove();
  });
});
