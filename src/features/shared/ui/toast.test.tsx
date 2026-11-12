import { cleanup, act, render, screen, within } from "@testing-library/react";
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

// Shows each message in turn, with the tone named by an "error:" prefix.
function Burst({ messages }: { messages: string[] }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => messages.forEach((message) => (message.startsWith("error:") ? toast.show({ message: message.slice(6), tone: "error" }) : toast.show({ message, tone: "ok" })))}
    >
      Burst
    </button>
  );
}

const shownMessages = () => Array.from(document.querySelectorAll(".ui-toast-message"), (node) => node.textContent);

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

  it("shows the same sentence once and keeps at most three toasts", () => {
    const add = (id: number, message: string) => ({ type: "add" as const, entry: { id, message } });
    let entries = toastReducer([], add(1, "a"));
    entries = toastReducer(entries, add(2, "a"));
    expect(entries.map((entry) => entry.id)).toEqual([2]);
    entries = toastReducer(entries, add(3, "b"));
    entries = toastReducer(entries, add(4, "c"));
    entries = toastReducer(entries, add(5, "d"));
    expect(entries.map((entry) => entry.message)).toEqual(["b", "c", "d"]);
  });

  it("clears every entry", () => {
    const one = toastReducer([], { type: "add", entry: { id: 1, message: "a" } });
    expect(toastReducer(one, { type: "clear" })).toEqual([]);
  });

  it("renders the queue in order, evicts the oldest, and shows a repeated sentence once", () => {
    const { rerender } = render(<ToastProvider><Burst messages={["a", "b", "c"]} /></ToastProvider>);
    act(() => screen.getByRole("button", { name: "Burst" }).click());
    expect(shownMessages()).toEqual(["a", "b", "c"]);

    rerender(<ToastProvider><Burst messages={["d"]} /></ToastProvider>);
    act(() => screen.getByRole("button", { name: "Burst" }).click());
    expect(shownMessages()).toEqual(["b", "c", "d"]);

    rerender(<ToastProvider><Burst messages={["b"]} /></ToastProvider>);
    act(() => screen.getByRole("button", { name: "Burst" }).click());
    expect(shownMessages()).toEqual(["c", "d", "b"]);
  });

  it("shows polite and error toasts together, each in its own region", () => {
    render(<ToastProvider><Burst messages={["Saved", "error:Failed"]} /></ToastProvider>);
    act(() => screen.getByRole("button", { name: "Burst" }).click());
    expect(within(screen.getByRole("status")).getByText("Saved")).toBeInTheDocument();
    expect(within(screen.getByRole("alert")).getByText("Failed")).toBeInTheDocument();
  });

  it("leaves after the default 5 s", () => {
    vi.useFakeTimers();
    render(<ToastProvider><Trigger input={{ message: "Signed out", tone: "ok" }} /></ToastProvider>);
    act(() => screen.getByRole("button", { name: "Show" }).click());
    act(() => { vi.advanceTimersByTime(4_900); });
    expect(screen.getByText("Signed out")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("Signed out")).toBeNull();
  });

  it("dismisses an error with a mouse click on Dismiss", async () => {
    const user = userEvent.setup();
    setup({ message: "Couldn't update watched state", tone: "error" });
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Couldn't update watched state")).toBeNull();
  });

  it("drops toasts while suppressed, clears the visible ones, and does not bring them back", () => {
    const tree = (suppressed: boolean) => (
      <ToastProvider suppressed={suppressed}><Trigger input={{ message: "Stuck", tone: "error" }} /></ToastProvider>
    );
    const { rerender } = render(tree(false));
    act(() => screen.getByRole("button", { name: "Show" }).click());
    expect(screen.getByText("Stuck")).toBeInTheDocument();

    rerender(tree(true));
    expect(screen.queryByText("Stuck")).toBeNull();
    act(() => screen.getByRole("button", { name: "Show" }).click());
    expect(screen.queryByText("Stuck")).toBeNull();

    rerender(tree(false));
    expect(screen.queryByText("Stuck")).toBeNull();
  });

  it("needs a provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger input={{ message: "x" }} />)).toThrow("ToastProvider");
    error.mockRestore();
  });
});
