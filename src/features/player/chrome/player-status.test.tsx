import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayerStatus } from "./player-status";

afterEach(cleanup);

describe("PlayerStatus", () => {
  it("is a status with its text and a decorative ring", () => {
    const { container } = render(<PlayerStatus text="Buffering…" />);
    expect(screen.getByRole("status", { name: "Player status" })).toHaveTextContent("Buffering…");
    expect(container.querySelector(".player-status-disc")).toHaveAttribute("aria-hidden", "true");
  });
});
