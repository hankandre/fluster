import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useTvForm } from "./use-tv-form";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
});

function Probe() {
  return <p>{useTvForm() ? "tv" : "desktop"}</p>;
}

describe("useTvForm", () => {
  it("re-renders when the attribute flips", async () => {
    render(<Probe />);
    expect(screen.getByText("desktop")).toBeInTheDocument();
    await act(async () => {
      document.documentElement.dataset.form = "tv";
      await Promise.resolve();
    });
    expect(screen.getByText("tv")).toBeInTheDocument();
    await act(async () => {
      delete document.documentElement.dataset.form;
      await Promise.resolve();
    });
    expect(screen.getByText("desktop")).toBeInTheDocument();
  });
});
