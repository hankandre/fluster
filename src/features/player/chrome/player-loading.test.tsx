import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerLoading } from "./player-loading";

afterEach(cleanup);

describe("PlayerLoading", () => {
  it("shows the title, the status text, and Back, and draws no slider or transport buttons", () => {
    const onBack = vi.fn();
    render(<PlayerLoading title="Arrival" text="Opening the original file…" onBack={onBack} />);
    expect(screen.getByRole("heading", { level: 1, name: "Arrival" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Opening the original file…");
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Back"]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the series line and the backdrop image when it has them", () => {
    const { container } = render(
      <PlayerLoading title="S1 · E2 Log" seriesLine="Hearth" backdrop={{ src: "https://img.test/b.jpg" }} text="Loading…" onBack={vi.fn()} />,
    );
    expect(screen.getByText("Hearth")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "https://img.test/b.jpg");
  });
});
