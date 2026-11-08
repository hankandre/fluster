import { cleanup, act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toastReducer, ToastProvider, useToast, type ToastInput } from "./toast";

function Trigger({ input }: { input: ToastInput }) {
  const toast = useToast();
  return <button type="button" onClick={() => toast.show(input)}>Show</button>;
}

function setup(input: ToastInput, durationMs = 5_000) {
  return render(<ToastProvider durationMs={durationMs}><Trigger input={input} /></ToastProvider>);
}

afterEach(() => vi.useRealTimers());

afterEach(cleanup);

describe("Toast", () => {
  it("announces politely without taking focus", async () => {
    const user = userEvent.setup();
    setup({ message: "Marked as watched", tone: "ok" });
    const opener = screen.getByRole("button", { name: "Show" });
    await user.click(opener);
    expect(screen.getByRole("status")).toHaveTextContent("Marked as watched");
    expect(opener).toHaveFocus();
  });

  it("puts errors in an alert region", async () => {
    const user = userEvent.setup();
    setup({ message: "Couldn't update watched state", tone: "error" });
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't update watched state");
  });

  it("leaves after the duration, but errors stay", () => {
    vi.useFakeTimers();
    const { rerender } = setup({ message: "Signed out" }, 1_000);
    act(() => screen.getByRole("button", { name: "Show" }).click());
    expect(screen.getByText("Signed out")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1_100); });
    expect(screen.queryByText("Signed out")).toBeNull();

    rerender(<ToastProvider durationMs={1_000}><Trigger input={{ message: "Stuck", tone: "error" }} /></ToastProvider>);
    act(() => screen.getByRole("button", { name: "Show" }).click());
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText("Stuck")).toBeInTheDocument();
  });

  it("waits while focus is inside it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({ message: "Signed out" }, 1_000);
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByText("Signed out")).toBeInTheDocument();
  });

  it("runs its action with Enter and dismisses", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    setup({ message: "Marked as watched", action: { label: "Undo", onAction } });
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Marked as watched")).toBeNull();
  });

  it("dismisses on Escape and gives focus back to where it was", async () => {
    const user = userEvent.setup();
    setup({ message: "Marked as watched" });
    const opener = screen.getByRole("button", { name: "Show" });
    await user.click(opener);
    await user.tab();
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Marked as watched")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("dismisses with Enter on the dismiss button", async () => {
    const user = userEvent.setup();
    setup({ message: "Marked as watched" });
    const opener = screen.getByRole("button", { name: "Show" });
    await user.click(opener);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Marked as watched")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("ignores arrows", async () => {
    const user = userEvent.setup();
    setup({ message: "Marked as watched" });
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(screen.getByText("Marked as watched")).toBeInTheDocument();
  });

  it("reduces entries with add and dismiss", () => {
    const one = toastReducer([], { type: "add", entry: { id: 1, message: "a" } });
    const two = toastReducer(one, { type: "add", entry: { id: 2, message: "b" } });
    expect(toastReducer(two, { type: "dismiss", id: 1 }).map((entry) => entry.id)).toEqual([2]);
  });

  it("needs a provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger input={{ message: "x" }} />)).toThrow("ToastProvider");
    error.mockRestore();
  });
});
