import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSearchShortcut } from "./use-search-shortcut";

function Host({ withField = false }: { withField?: boolean }) {
  useSearchShortcut();
  return (
    <div>
      <button>Card</button>
      <input aria-label="Other" />
      <textarea aria-label="Notes" />
      <div contentEditable suppressContentEditableWarning aria-label="Editable" tabIndex={0} />
      <div role="dialog" aria-label="Dialog"><button>In dialog</button></div>
      {withField ? <input aria-label="Search" data-search-field="" defaultValue="alien" /> : null}
    </div>
  );
}

beforeEach(() => {
  window.location.hash = "#/next/home";
});
afterEach(cleanup);

function press(target: Element, init: KeyboardEventInit = {}): boolean {
  return fireEvent.keyDown(target, { key: "/", ...init });
}

describe("useSearchShortcut", () => {
  it("focuses and selects an existing search field", () => {
    render(<Host withField />);
    const notPrevented = press(screen.getByRole("button", { name: "Card" }));
    const field = screen.getByLabelText("Search") as HTMLInputElement;
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);
    expect(notPrevented).toBe(false);
    expect(window.location.hash).toBe("#/next/home");
  });

  it("opens Search when no field is on screen", () => {
    render(<Host />);
    press(screen.getByRole("button", { name: "Card" }));
    expect(window.location.hash).toBe("#/next/search");
  });

  it("ignores a slash typed in an input, a textarea, and a content-editable element", () => {
    render(<Host />);
    for (const name of ["Other", "Notes", "Editable"]) {
      const notPrevented = press(screen.getByLabelText(name));
      expect(notPrevented).toBe(true);
    }
    expect(window.location.hash).toBe("#/next/home");
  });

  it("ignores Ctrl, Meta, Alt, a prevented event, and a dialog", () => {
    render(<Host />);
    const card = screen.getByRole("button", { name: "Card" });
    press(card, { ctrlKey: true });
    press(card, { metaKey: true });
    press(card, { altKey: true });
    press(screen.getByRole("button", { name: "In dialog" }));
    card.addEventListener("keydown", (event) => event.preventDefault());
    press(card);
    expect(window.location.hash).toBe("#/next/home");
  });

  it("ignores other keys and removes its listener on unmount", () => {
    const { unmount } = render(<Host />);
    press(screen.getByRole("button", { name: "Card" }), { key: "a" });
    expect(window.location.hash).toBe("#/next/home");
    unmount();
    press(document.body);
    expect(window.location.hash).toBe("#/next/home");
  });
});
