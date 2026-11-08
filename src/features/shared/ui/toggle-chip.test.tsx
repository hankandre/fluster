import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ToggleChip } from "./toggle-chip";

function Chip() {
  const [on, setOn] = useState(false);
  return <ToggleChip pressed={on} onPressedChange={setOn}>Unwatched</ToggleChip>;
}

afterEach(cleanup);

describe("ToggleChip", () => {
  it("toggles aria-pressed with Enter and Space and keeps focus", async () => {
    const user = userEvent.setup();
    render(<Chip />);
    const chip = screen.getByRole("button", { name: "Unwatched" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.tab();
    await user.keyboard("{Enter}");
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await user.keyboard(" ");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveFocus();
  });

  it("shows a check shape when on, not only a colour", async () => {
    const user = userEvent.setup();
    const { container } = render(<Chip />);
    expect(container.querySelector("svg")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Unwatched" }));
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("ignores arrows and Escape", async () => {
    const user = userEvent.setup();
    render(<Chip />);
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowLeft}{Escape}");
    expect(screen.getByRole("button", { name: "Unwatched" })).toHaveAttribute("aria-pressed", "false");
  });
});
