import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowseToolbar } from "./browse-toolbar";

afterEach(cleanup);

const sortOptions = [
  { value: "name-asc", label: "Name A to Z" },
  { value: "added-desc", label: "Newest added first" },
];

function Harness({ count, onSortChange = () => {} }: { count?: string; onSortChange?(value: string): void }) {
  const [sort, setSort] = useState("name-asc");
  const [on, setOn] = useState<string[]>([]);
  return (
    <main>
      <BrowseToolbar
        sortOptions={sortOptions}
        sortValue={sort}
        onSortChange={(value) => { setSort(value); onSortChange(value); }}
        filters={["Unwatched", "Favorites", "In progress"].map((label) => ({ value: label, label, pressed: on.includes(label) }))}
        onFilterChange={(value, pressed) => setOn(pressed ? [...on, value] : on.filter((item) => item !== value))}
        count={count}
      />
      <ul data-spatial-row=""><li><a href="#/x" data-roving-item="">Card</a></li></ul>
    </main>
  );
}

describe("BrowseToolbar", () => {
  it("is a named toolbar with a sort picker and three chips", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: "Sort and filter" });
    expect(within(toolbar).getByRole("button", { name: "Sort Name A to Z" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("group", { name: "Filters" })).toBeInTheDocument();
    expect(within(toolbar).getAllByRole("button", { pressed: false })).toHaveLength(3);
    expect(toolbar.querySelector("select, input")).toBeNull();
  });

  it("reports the chosen sort", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(<Harness onSortChange={onSortChange} />);
    await user.click(screen.getByRole("button", { name: "Sort Name A to Z" }));
    await user.click(screen.getByRole("option", { name: "Newest added first" }));
    expect(onSortChange).toHaveBeenCalledWith("added-desc");
    expect(screen.getByRole("button", { name: "Sort Newest added first" })).toHaveFocus();
  });

  it("toggles chips with click, Enter, and Space", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "Unwatched" });
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{Enter}");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.keyboard(" ");
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("moves between controls with Left and Right and is one Tab stop", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Sort Name A to Z" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Unwatched" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Favorites" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "Unwatched" })).toHaveFocus();
    const stops = within(screen.getByRole("toolbar")).getAllByRole("button").filter((button) => button.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
  });

  it("moves Down from a chip to the next spatial row", () => {
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "Unwatched" });
    chip.focus();
    fireEvent.keyDown(chip, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Card" })).toHaveFocus();
  });

  it("shows the count only when given", () => {
    const { rerender } = render(<Harness count="248 items" />);
    expect(screen.getByText("248 items")).toBeInTheDocument();
    rerender(<Harness />);
    expect(screen.queryByText(/items/)).not.toBeInTheDocument();
  });
});
