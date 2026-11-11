import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Overview } from "./overview";

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
});

function overflow(scroll: number, client: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => scroll });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => client });
}

describe("Overview", () => {
  it("has no More button when the text fits", () => {
    overflow(60, 60);
    render(<main><Overview text="Short." /></main>);
    expect(screen.getByText("Short.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers More when the text overflows, and More/Less toggles the clamp", () => {
    overflow(120, 60);
    render(<main><Overview text="Long text." /></main>);
    const button = screen.getByRole("button", { name: "More" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", screen.getByText("Long text.").id);
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Less" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Long text.")).toHaveAttribute("data-expanded", "true");
  });
});
