import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaveAppDialog } from "./leave-app-dialog";
import { useBackspaceAsEscape } from "./use-backspace-as-escape";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
});

function Harness({ open = true, onStay, onLeave }: { open?: boolean; onStay(): void; onLeave(): void }) {
  useBackspaceAsEscape();
  return <LeaveAppDialog open={open} onStay={onStay} onLeave={onLeave} />;
}

describe("LeaveAppDialog", () => {
  it("is an alertdialog with Stay focused and Leave primary", () => {
    render(<Harness onStay={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByRole("alertdialog", { name: "Leave Fluster?" })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Stay", "Leave"]);
    expect(screen.getByRole("button", { name: "Stay" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Leave" })).toHaveClass("ui-button--primary");
  });

  it("stays on Escape and on Backspace in the TV form", () => {
    document.documentElement.dataset.form = "tv";
    const onStay = vi.fn();
    const onLeave = vi.fn();
    render(<Harness onStay={onStay} onLeave={onLeave} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Stay" }), { key: "Escape" });
    expect(onStay).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("button", { name: "Stay" }), { key: "Backspace" });
    expect(onStay).toHaveBeenCalledTimes(2);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("leaves when Leave is activated", () => {
    const onLeave = vi.fn();
    render(<Harness onStay={vi.fn()} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed", () => {
    render(<Harness open={false} onStay={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
