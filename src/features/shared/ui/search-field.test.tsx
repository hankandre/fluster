import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchField, type SearchFieldProps } from "./search-field";

afterEach(cleanup);

function props(overrides: Partial<SearchFieldProps> = {}): SearchFieldProps {
  return {
    id: "f",
    label: "Search movies, series, and episodes",
    value: "",
    listId: "list",
    expanded: false,
    onChange: vi.fn(),
    onKeyDown: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

describe("SearchField", () => {
  it("names the combobox with its label and passes the combobox attributes through", () => {
    render(<SearchField {...props({ expanded: true, activeDescendant: "list-1" })} />);
    const input = screen.getByRole("combobox", { name: "Search movies, series, and episodes" });
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-controls", "list");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-activedescendant", "list-1");
    expect(input).toHaveAttribute("data-search-field");
    expect(input).toHaveAttribute("data-roving-item");
  });

  it("hides the icon from assistive technology", () => {
    const { container } = render(<SearchField {...props()} />);
    expect(container.querySelector(".ui-search-field-icon")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the clear button only with text, and calls onClear", () => {
    const onClear = vi.fn();
    const { rerender } = render(<SearchField {...props({ onClear })} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    rerender(<SearchField {...props({ value: "arr", onClear })} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("reports text changes and key presses", () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    render(<SearchField {...props({ onChange, onKeyDown })} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("ab");
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
