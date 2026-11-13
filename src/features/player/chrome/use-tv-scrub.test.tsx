import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS } from "../../shared/hold-key";
import { SCRUB_TICK_MS, scrubStep } from "./scrub-step";
import { useTvScrub } from "./use-tv-scrub";

const DURATION = 7200;

function Harness({ onSeek, onScrubHold }: { onSeek(seconds: number): void; onScrubHold(held: boolean): void }) {
  const [pending, setPending] = useState<number>();
  const keys = useTvScrub({ playhead: 600, duration: DURATION, setPending, onSeek, onScrubHold });
  return <input aria-label="slider" data-pending={pending ?? ""} {...keys} />;
}

const input = () => screen.getByLabelText("slider");
const pending = () => input().getAttribute("data-pending");

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const onSeek = vi.fn();
  const onScrubHold = vi.fn();
  render(<Harness onSeek={onSeek} onScrubHold={onScrubHold} />);
  return { onSeek, onScrubHold };
}

describe("useTvScrub", () => {
  it("steps 10 s on a press and commits on release", () => {
    const { onSeek, onScrubHold } = setup();
    fireEvent.keyDown(input(), { key: "ArrowRight" });
    act(() => vi.advanceTimersByTime(HOLD_MS - 1));
    fireEvent.keyUp(input(), { key: "ArrowRight" });
    expect(onSeek).toHaveBeenCalledWith(610);
    expect(onScrubHold).not.toHaveBeenCalled();
    expect(pending()).toBe("");
  });

  it("starts a scrub at the hold threshold and moves by the step each tick without seeking", () => {
    const { onSeek, onScrubHold } = setup();
    fireEvent.keyDown(input(), { key: "ArrowRight" });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onScrubHold).toHaveBeenCalledWith(true);
    act(() => vi.advanceTimersByTime(SCRUB_TICK_MS));
    expect(pending()).toBe(String(610 + scrubStep(HOLD_MS + SCRUB_TICK_MS, DURATION)));
    fireEvent.keyUp(input(), { key: "ArrowRight" });
    expect(onSeek).not.toHaveBeenCalled();
    const held = pending();
    act(() => vi.advanceTimersByTime(2000));
    expect(pending()).toBe(held);
  });

  it("commits the pending position on OK, then resumes", () => {
    const { onSeek, onScrubHold } = setup();
    fireEvent.keyDown(input(), { key: "ArrowRight" });
    act(() => vi.advanceTimersByTime(HOLD_MS + SCRUB_TICK_MS));
    fireEvent.keyUp(input(), { key: "ArrowRight" });
    const target = Number(pending());
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(false);
    expect(onSeek).toHaveBeenCalledWith(target);
    expect(onScrubHold).toHaveBeenLastCalledWith(false);
    expect(onSeek.mock.invocationCallOrder[0]).toBeLessThan(onScrubHold.mock.invocationCallOrder[1]);
    expect(pending()).toBe("");
  });

  it("drops the pending position on Escape without seeking and stops the event", () => {
    const { onSeek, onScrubHold } = setup();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    fireEvent.keyDown(input(), { key: "ArrowRight" });
    act(() => vi.advanceTimersByTime(HOLD_MS + SCRUB_TICK_MS));
    fireEvent.keyUp(input(), { key: "ArrowRight" });
    outer.mockClear();
    fireEvent.keyDown(input(), { key: "Escape" });
    document.removeEventListener("keydown", outer);
    expect(onSeek).not.toHaveBeenCalled();
    expect(onScrubHold).toHaveBeenLastCalledWith(false);
    expect(pending()).toBe("");
    expect(outer).not.toHaveBeenCalled();
  });

  it("lets Enter and Escape through when not scrubbing", () => {
    setup();
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(input(), { key: "Escape" })).toBe(true);
  });

  it("cancels on blur while scrubbing", () => {
    const { onSeek, onScrubHold } = setup();
    fireEvent.keyDown(input(), { key: "ArrowRight" });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    fireEvent.blur(input());
    expect(onSeek).not.toHaveBeenCalled();
    expect(onScrubHold).toHaveBeenLastCalledWith(false);
  });

  it("moves 10 s on a press while scrubbing without committing", () => {
    const { onSeek } = setup();
    fireEvent.keyDown(input(), { key: "ArrowRight" });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    fireEvent.keyUp(input(), { key: "ArrowRight" });
    const before = Number(pending());
    fireEvent.keyDown(input(), { key: "ArrowLeft" });
    fireEvent.keyUp(input(), { key: "ArrowLeft" });
    expect(Number(pending())).toBe(before - 10);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("starts a hold from an untracked repeat without stepping at once", () => {
    const { onSeek, onScrubHold } = setup();
    fireEvent.keyDown(input(), { key: "ArrowRight", repeat: true });
    expect(pending()).toBe("");
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onScrubHold).toHaveBeenCalledWith(true);
    fireEvent.keyUp(input(), { key: "ArrowRight" });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("ignores a keyup with nothing tracked", () => {
    const { onSeek } = setup();
    fireEvent.keyUp(input(), { key: "ArrowRight" });
    expect(onSeek).not.toHaveBeenCalled();
  });
});
