import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBackspaceAsEscape } from "./use-backspace-as-escape";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
});

function Page({ onEscape }: { onEscape: () => void }) {
  useBackspaceAsEscape();
  return (
    <div onKeyDown={(event) => event.key === "Escape" && onEscape()}>
      <button type="button">Action</button>
      <input type="text" aria-label="Text" />
      <input type="search" aria-label="Search" />
      <textarea aria-label="Area" />
      <div contentEditable suppressContentEditableWarning aria-label="Editable">x</div>
    </div>
  );
}

describe("useBackspaceAsEscape", () => {
  beforeEach(() => {
    document.documentElement.dataset.form = "tv";
  });

  it("turns Backspace on a button into Escape on the same target", () => {
    const onEscape = vi.fn();
    render(<Page onEscape={onEscape} />);
    const notPrevented = fireEvent.keyDown(screen.getByRole("button"), { key: "Backspace" });
    expect(notPrevented).toBe(false);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("leaves Backspace alone in text fields and editable content", () => {
    const onEscape = vi.fn();
    render(<Page onEscape={onEscape} />);
    for (const element of [screen.getByLabelText("Text"), screen.getByLabelText("Search"), screen.getByLabelText("Area"), screen.getByLabelText("Editable")]) {
      expect(fireEvent.keyDown(element, { key: "Backspace" })).toBe(true);
    }
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("ignores modifiers and composition", () => {
    const onEscape = vi.fn();
    render(<Page onEscape={onEscape} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Backspace", ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("button"), { key: "Backspace", isComposing: true });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("does nothing on desktop", () => {
    delete document.documentElement.dataset.form;
    const onEscape = vi.fn();
    render(<Page onEscape={onEscape} />);
    expect(fireEvent.keyDown(screen.getByRole("button"), { key: "Backspace" })).toBe(true);
    expect(fireEvent.keyDown(screen.getByLabelText("Text"), { key: "Backspace" })).toBe(true);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("follows the form at event time", () => {
    delete document.documentElement.dataset.form;
    const onEscape = vi.fn();
    render(<Page onEscape={onEscape} />);
    document.documentElement.dataset.form = "tv";
    fireEvent.keyDown(screen.getByRole("button"), { key: "Backspace" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
