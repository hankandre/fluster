import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OptionList } from "./option-list";

afterEach(cleanup);

const options = [
  { value: "a", label: "English", description: "AAC 5.1" },
  { value: "b", label: "French" },
  { value: "c", label: "German", disabled: true },
  { value: "d", label: "Spanish" },
];

function renderList(value: string | undefined | null = "b", onChange = vi.fn(), disabled = false) {
  render(<OptionList label="Audio track" options={options} value={value ?? undefined} onChange={onChange} disabled={disabled} />);
  return onChange;
}

describe("OptionList", () => {
  it("is a named listbox of options with the selected one marked and a second line", () => {
    renderList();
    expect(screen.getByRole("listbox", { name: "Audio track" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true", "false", "false"]);
    expect(screen.getByRole("option", { name: /English/ })).toHaveTextContent("AAC 5.1");
  });

  it("keeps one row in the tab order: the selected row, else the first enabled one", () => {
    renderList("b");
    expect(screen.getAllByRole("option").map((option) => option.tabIndex)).toEqual([-1, 0, -1, -1]);
    cleanup();
    renderList(null);
    expect(screen.getAllByRole("option").map((option) => option.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it("moves with the arrows, Home, and End, skipping disabled rows", () => {
    renderList("b");
    const [english, french, , spanish] = screen.getAllByRole("option");
    french.focus();
    fireEvent.keyDown(french, { key: "ArrowDown" });
    expect(spanish).toHaveFocus();
    fireEvent.keyDown(spanish, { key: "ArrowUp" });
    expect(french).toHaveFocus();
    fireEvent.keyDown(french, { key: "Home" });
    expect(english).toHaveFocus();
    fireEvent.keyDown(english, { key: "End" });
    expect(spanish).toHaveFocus();
  });

  it("chooses with Enter, Space, and a click, but not a disabled row", () => {
    const onChange = renderList();
    const [english, , german, spanish] = screen.getAllByRole("option");
    fireEvent.keyDown(english, { key: "Enter" });
    fireEvent.keyDown(spanish, { key: " " });
    fireEvent.click(german);
    fireEvent.keyDown(german, { key: "Enter" });
    fireEvent.click(spanish);
    expect(onChange.mock.calls.map(([choice]) => choice)).toEqual(["a", "d", "d"]);
  });

  it("does nothing while disabled", () => {
    const onChange = renderList("b", vi.fn(), true);
    const [english] = screen.getAllByRole("option");
    fireEvent.click(english);
    fireEvent.keyDown(english, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("option").every((option) => option.tabIndex === -1)).toBe(true);
  });
});
