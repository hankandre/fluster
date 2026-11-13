import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHROME_IDLE_MS } from "./timing";
import { CHROME_ZONE_ATTRIBUTE, useChromeVisibility } from "./use-chrome-visibility";

function Harness({ playing, pinned = false }: { playing: boolean; pinned?: boolean }) {
  const { visible, sectionProps } = useChromeVisibility({ playing, pinned });
  return (
    <section aria-label="Stage" data-visible={visible} {...sectionProps}>
      <button type="button" {...{ [CHROME_ZONE_ATTRIBUTE]: "" }}>Control</button>
      <button type="button">Plain</button>
    </section>
  );
}

const stage = () => screen.getByRole("region", { name: "Stage" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("useChromeVisibility", () => {
  it("matches the --chrome-idle-ms token", () => {
    const tokens = readFileSync(join(__dirname, "../../../styles/tokens.css"), "utf8");
    expect(tokens).toContain(`--chrome-idle-ms: ${CHROME_IDLE_MS};`);
  });

  it("is visible while paused, however long it is left alone", () => {
    render(<Harness playing={false} />);
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 4));
    expect(stage()).toHaveAttribute("data-visible", "true");
  });

  it("stays up from the first start until the pointer moves", () => {
    render(<Harness playing />);
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 4));
    expect(stage()).toHaveAttribute("data-visible", "true");
  });

  it("hides three seconds after resuming from a pause", () => {
    const { rerender } = render(<Harness playing={false} />);
    rerender(<Harness playing />);
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 100));
    expect(stage()).toHaveAttribute("data-visible", "true");
    act(() => vi.advanceTimersByTime(200));
    expect(stage()).toHaveAttribute("data-visible", "false");
  });

  it("hides three seconds after the last pointer move while playing", () => {
    render(<Harness playing />);
    fireEvent.mouseMove(stage(), { clientX: 3, clientY: 3 });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(stage()).toHaveAttribute("data-visible", "false");
    fireEvent.mouseMove(stage(), { clientX: 6, clientY: 6 });
    expect(stage()).toHaveAttribute("data-visible", "true");
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 100));
    expect(stage()).toHaveAttribute("data-visible", "true");
    fireEvent.mouseMove(stage(), { clientX: 9, clientY: 9 });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 100));
    expect(stage()).toHaveAttribute("data-visible", "true");
    act(() => vi.advanceTimersByTime(200));
    expect(stage()).toHaveAttribute("data-visible", "false");
  });

  it("hides at once when the pointer leaves while playing, but not while paused", () => {
    const { rerender } = render(<Harness playing />);
    fireEvent.mouseMove(stage(), { clientX: 12, clientY: 12 });
    fireEvent.mouseLeave(stage());
    expect(stage()).toHaveAttribute("data-visible", "false");
    rerender(<Harness playing={false} />);
    fireEvent.mouseLeave(stage());
    expect(stage()).toHaveAttribute("data-visible", "true");
  });

  it("stays up while pinned and hides again after unpinning", () => {
    const { rerender } = render(<Harness playing pinned />);
    fireEvent.mouseMove(stage(), { clientX: 15, clientY: 15 });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 3));
    expect(stage()).toHaveAttribute("data-visible", "true");
    rerender(<Harness playing />);
    fireEvent.mouseMove(stage(), { clientX: 18, clientY: 18 });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(stage()).toHaveAttribute("data-visible", "false");
  });

  it("stays up while a chrome control has keyboard focus, but not a plain element", () => {
    render(<Harness playing />);
    fireEvent.mouseMove(stage(), { clientX: 21, clientY: 21 });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    act(() => screen.getByRole("button", { name: "Plain" }).focus());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(stage()).toHaveAttribute("data-visible", "false");
    act(() => screen.getByRole("button", { name: "Control" }).focus());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 2));
    expect(stage()).toHaveAttribute("data-visible", "true");
    act(() => screen.getByRole("button", { name: "Plain" }).focus());
    act(() => vi.advanceTimersByTime(1));
    expect(stage()).toHaveAttribute("data-visible", "false");
  });

  it("does not hold the chrome up for a control focused by a click", () => {
    render(<Harness playing />);
    fireEvent.mouseMove(stage(), { clientX: 24, clientY: 24 });
    const control = screen.getByRole("button", { name: "Control" });
    fireEvent.pointerDown(control);
    act(() => control.focus());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(stage()).toHaveAttribute("data-visible", "false");
  });

  it("does not hold the chrome up when Escape closes a mouse-opened sheet and focus is restored", () => {
    const { rerender } = render(<Harness playing />);
    fireEvent.mouseMove(stage(), { clientX: 30, clientY: 30 });
    const control = screen.getByRole("button", { name: "Control" });
    fireEvent.pointerDown(control);
    act(() => control.focus());
    rerender(<Harness playing pinned />);
    act(() => screen.getByRole("button", { name: "Plain" }).focus());
    fireEvent.keyDown(window, { key: "Escape" });
    rerender(<Harness playing />);
    act(() => control.focus());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(stage()).toHaveAttribute("data-visible", "false");
  });

  it("still treats focus after another key as keyboard focus", () => {
    render(<Harness playing />);
    fireEvent.mouseMove(stage(), { clientX: 33, clientY: 33 });
    const control = screen.getByRole("button", { name: "Control" });
    fireEvent.pointerDown(control);
    fireEvent.keyDown(window, { key: "Tab" });
    act(() => control.focus());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 100));
    expect(stage()).toHaveAttribute("data-visible", "true");
  });
});

describe("useChromeVisibility in the TV form", () => {
  function TvHarness({ playing }: { playing: boolean }) {
    const { visible, sectionProps } = useChromeVisibility({ playing, pinned: false, tv: true });
    return (
      <section aria-label="Stage" data-visible={visible} {...sectionProps}>
        <button type="button" {...{ [CHROME_ZONE_ATTRIBUTE]: "" }}>Control</button>
        <div className="player-prompt" {...{ [CHROME_ZONE_ATTRIBUTE]: "" }}><button type="button">Prompt</button></div>
      </section>
    );
  }

  it("hides after the idle time even with a control focused; a key while shown extends it, a key while hidden does not wake it", () => {
    const { rerender } = render(<TvHarness playing={false} />);
    rerender(<TvHarness playing />);
    act(() => screen.getByRole("button", { name: "Control" }).focus());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 500));
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 500));
    expect(stage()).toHaveAttribute("data-visible", "true");
    act(() => vi.advanceTimersByTime(600));
    expect(stage()).toHaveAttribute("data-visible", "false");
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(stage()).toHaveAttribute("data-visible", "false");
  });

  it("stays up while a prompt has focus", () => {
    const { rerender } = render(<TvHarness playing={false} />);
    rerender(<TvHarness playing />);
    act(() => screen.getByRole("button", { name: "Prompt" }).focus());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 3));
    expect(stage()).toHaveAttribute("data-visible", "true");
  });
});
