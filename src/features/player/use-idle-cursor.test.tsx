import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useIdleCursor } from "./use-idle-cursor";

function Player() {
  const cursor = useIdleCursor();
  return (
    <main data-testid="root" className={cursor.idle ? "cursor-idle" : ""} onPointerMove={cursor.onPointerMove}>
      <button type="button">Back</button>
    </main>
  );
}

let hovered: Element[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  hovered = [];
  const original = Document.prototype.querySelectorAll;
  vi.spyOn(document, "querySelectorAll").mockImplementation(((selector: string) => (
    selector === ":hover" ? hovered : original.call(document, selector)
  )) as typeof document.querySelectorAll);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("hides the cursor after three seconds when the player opens under a still pointer", () => {
  render(<Player />);
  const root = screen.getByTestId("root");
  hovered = [root];
  act(() => vi.advanceTimersByTime(2_999));
  expect(root).not.toHaveClass("cursor-idle");
  act(() => vi.advanceTimersByTime(1));
  expect(root).toHaveClass("cursor-idle");
});

it("keeps the cursor on a control it already rested on when the player opened, until it leaves", () => {
  render(<Player />);
  const root = screen.getByTestId("root");
  hovered = [root, screen.getByRole("button", { name: "Back" })];
  act(() => vi.advanceTimersByTime(10_000));
  expect(root).not.toHaveClass("cursor-idle");

  hovered = [root];
  act(() => vi.advanceTimersByTime(3_000));
  expect(root).toHaveClass("cursor-idle");
});
