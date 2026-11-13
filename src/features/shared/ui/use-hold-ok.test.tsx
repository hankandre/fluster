import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS } from "../hold-key";
import { useHoldOk } from "./use-hold-ok";

function Card({ onClick, details = "#/next/item/x" }: { onClick(): void; details?: string }) {
  const hold = useHoldOk(details);
  return (
    <a href="#/next/play/x" onClick={(event) => { event.preventDefault(); onClick(); }} {...hold}>
      Card
    </a>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.dataset.form = "tv";
  window.location.hash = "#/next/home";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset.form;
});

describe("useHoldOk", () => {
  it("plays on release after a short press", () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick} />);
    const card = screen.getByRole("link");
    expect(fireEvent.keyDown(card, { key: "Enter" })).toBe(false);
    act(() => vi.advanceTimersByTime(HOLD_MS - 1));
    fireEvent.keyUp(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/next/home");
  });

  it("opens details on a hold and does not play on release", () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick} />);
    const card = screen.getByRole("link");
    fireEvent.keyDown(card, { key: "Enter" });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(window.location.hash).toBe("#/next/item/x");
    fireEvent.keyUp(card, { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("swallows Enter repeats after the hold until keyup", () => {
    render(<Card onClick={vi.fn()} />);
    const card = screen.getByRole("link");
    fireEvent.keyDown(card, { key: "Enter" });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    const seen = vi.fn();
    const probe = document.createElement("button");
    probe.addEventListener("keydown", seen);
    document.body.append(probe);
    expect(fireEvent.keyDown(probe, { key: "Enter", repeat: true })).toBe(false);
    expect(seen).not.toHaveBeenCalled();
    fireEvent.keyUp(probe, { key: "Enter" });
    fireEvent.keyDown(probe, { key: "Enter" });
    expect(seen).toHaveBeenCalledTimes(1);
    probe.remove();
  });

  it("cancels on blur", () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick} />);
    const card = screen.getByRole("link");
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.blur(card);
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(window.location.hash).toBe("#/next/home");
    fireEvent.keyUp(card, { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does nothing on desktop", () => {
    delete document.documentElement.dataset.form;
    render(<Card onClick={vi.fn()} />);
    const card = screen.getByRole("link");
    expect(fireEvent.keyDown(card, { key: "Enter" })).toBe(true);
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(window.location.hash).toBe("#/next/home");
  });
});
