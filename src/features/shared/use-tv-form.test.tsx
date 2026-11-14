import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { armReturnNow } from "../../test/arm-return";
import { finishReturn, resetFocusReturn } from "../shell/focus-return";
import { useTvForm, useTvPrimaryRef } from "./use-tv-form";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
  resetFocusReturn();
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

function Primary() {
  const ref = useTvPrimaryRef();
  return <main><button ref={ref}>Play</button></main>;
}

describe("useTvPrimaryRef", () => {
  it("focuses the primary action in the TV form", () => {
    document.documentElement.dataset.form = "tv";
    render(<Primary />);
    expect(screen.getByRole("button", { name: "Play" })).toHaveFocus();
  });

  it("does not focus it while a return is pending, and hands it over when the return finishes", () => {
    document.documentElement.dataset.form = "tv";
    window.history.replaceState(null, "", "#/next/item/x");
    armReturnNow();
    render(<Primary />);
    expect(document.activeElement).toBe(document.body);
    act(() => finishReturn());
    expect(screen.getByRole("button", { name: "Play" })).toHaveFocus();
  });
});
