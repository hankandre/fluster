import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchSuggestion } from "./search-suggestion";

afterEach(cleanup);

function renderOption(overrides: Partial<Parameters<typeof SearchSuggestion>[0]> = {}) {
  return render(
    <ul role="listbox" aria-label="Suggestions">
      <SearchSuggestion
        id="o1"
        title="Arrival"
        meta="2016 · Movie"
        label="Arrival, 2016, Movie"
        variant="poster"
        selected={false}
        onChoose={vi.fn()}
        {...overrides}
      />
    </ul>,
  );
}

describe("SearchSuggestion", () => {
  it("is an option with its accessible name and selection", () => {
    renderOption({ selected: true });
    const option = screen.getByRole("option", { name: "Arrival, 2016, Movie" });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(option).toHaveAttribute("id", "o1");
  });

  it("shows the art, the title, and the meta line", () => {
    const { container } = renderOption({ image: "https://x.test/a.jpg" });
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://x.test/a.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(screen.getByText("Arrival")).toBeInTheDocument();
    expect(screen.getByText("2016 · Movie")).toBeInTheDocument();
  });

  it("shows a neutral block without an image", () => {
    const { container } = renderOption();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("card-image")).toHaveAttribute("data-placeholder", "neutral");
  });

  it("marks the art variant", () => {
    const { container } = renderOption({ variant: "still" });
    expect(container.querySelector(".ui-suggestion-art")).toHaveAttribute("data-variant", "still");
  });

  it("keeps focus in the input on mouse down and chooses on click", () => {
    const onChoose = vi.fn();
    renderOption({ onChoose });
    const option = screen.getByRole("option");
    const down = createEvent.mouseDown(option);
    fireEvent(option, down);
    expect(down.defaultPrevented).toBe(true);
    fireEvent.click(option);
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});
