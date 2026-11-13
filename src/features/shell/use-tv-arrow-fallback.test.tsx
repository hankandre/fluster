import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { pickArrowTarget, useTvArrowFallback } from "./use-tv-arrow-fallback";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
});

function place(element: HTMLElement, left: number, top: number, width = 100, height = 40) {
  element.getBoundingClientRect = () => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) });
}

function Page({ dialog }: { dialog?: boolean }) {
  useTvArrowFallback();
  return (
    <>
      <button type="button" data-at="0,0">A</button>
      <button type="button" data-at="200,0">B</button>
      <button type="button" data-at="0,100">C</button>
      <input type="text" aria-label="Field" data-at="200,100" />
      <div data-tv-own-arrows=""><button type="button" data-at="400,0">Own</button></div>
      {dialog ? <div role="dialog" aria-modal="true"><button type="button" data-at="0,300">D1</button><button type="button" data-at="200,300">D2</button></div> : null}
    </>
  );
}

function layout() {
  document.querySelectorAll<HTMLElement>("[data-at]").forEach((element) => {
    const [x, y] = element.dataset.at!.split(",").map(Number);
    place(element, x, y);
  });
}

describe("pickArrowTarget", () => {
  const from = { left: 0, top: 0, right: 100, bottom: 40 };
  it("picks the nearest box in each direction", () => {
    const boxes = [
      { left: 200, top: 0, right: 300, bottom: 40 },
      { left: 0, top: 100, right: 100, bottom: 140 },
    ];
    expect(pickArrowTarget("ArrowRight", from, boxes)).toBe(0);
    expect(pickArrowTarget("ArrowDown", from, boxes)).toBe(1);
    expect(pickArrowTarget("ArrowLeft", from, boxes)).toBeUndefined();
    expect(pickArrowTarget("ArrowUp", from, boxes)).toBeUndefined();
  });
});

describe("useTvArrowFallback", () => {
  it("moves focus in the TV form", () => {
    document.documentElement.dataset.form = "tv";
    render(<Page />);
    layout();
    const a = screen.getByRole("button", { name: "A" });
    a.focus();
    expect(fireEvent.keyDown(a, { key: "ArrowRight" })).toBe(false);
    expect(screen.getByRole("button", { name: "B" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "B" }), { key: "ArrowLeft" });
    expect(a).toHaveFocus();
    fireEvent.keyDown(a, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "C" })).toHaveFocus();
  });

  it("is inactive on desktop", () => {
    render(<Page />);
    layout();
    const a = screen.getByRole("button", { name: "A" });
    a.focus();
    expect(fireEvent.keyDown(a, { key: "ArrowRight" })).toBe(true);
    expect(a).toHaveFocus();
  });

  it("stays inside an open dialog", () => {
    document.documentElement.dataset.form = "tv";
    render(<Page dialog />);
    layout();
    const d1 = screen.getByRole("button", { name: "D1" });
    d1.focus();
    fireEvent.keyDown(d1, { key: "ArrowUp" });
    expect(d1).toHaveFocus();
    fireEvent.keyDown(d1, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "D2" })).toHaveFocus();
  });

  it("leaves Left and Right to a text field but moves Up and Down", () => {
    document.documentElement.dataset.form = "tv";
    render(<Page />);
    layout();
    const field = screen.getByLabelText("Field");
    field.focus();
    expect(fireEvent.keyDown(field, { key: "ArrowLeft" })).toBe(true);
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(screen.getByRole("button", { name: "B" })).toHaveFocus();
  });

  it("skips targets inside data-tv-own-arrows", () => {
    document.documentElement.dataset.form = "tv";
    render(<Page />);
    layout();
    const own = screen.getByRole("button", { name: "Own" });
    own.focus();
    expect(fireEvent.keyDown(own, { key: "ArrowLeft" })).toBe(true);
    expect(own).toHaveFocus();
  });
});
