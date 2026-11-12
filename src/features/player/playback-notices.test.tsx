import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import { DesktopOnlyNotice, ItemGoneScreen, ItemLoadNotice, PlaybackErrorNotice, PlayerUnavailableNotice, RefusalNotice } from "./playback-notices";
import { DESKTOP_ONLY_COPY, REFUSAL_COPY } from "./refusal-copy";

afterEach(cleanup);

const item: LibraryItem = { id: "e1", name: "The Keeper's Log", type: "Episode", seriesName: "Harbor Lights", season: 1, episode: 2, resumePositionTicks: 0, played: false };

async function expectOrder(names: string[]) {
  expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  for (const name of names) {
    await userEvent.tab();
    expect(screen.getByRole("button", { name })).toHaveFocus();
  }
}

describe("playback notices", () => {
  it("a refusal shows P10-11 copy, the item, Retry, and Back to details in order", async () => {
    const copy = REFUSAL_COPY["conversion-not-allowed"];
    const { container } = render(<RefusalNotice copy={copy} item={item} onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(container).toHaveTextContent(copy.explanation);
    expect(container).toHaveTextContent(copy.whatYouCanDo);
    expect(container.querySelector(".ui-notice-context")).toHaveTextContent("Harbor Lights · S1 · E2 The Keeper's Log");
    expect(screen.queryByRole("button", { name: /anyway/i })).not.toBeInTheDocument();
    await expectOrder(["Retry", "Back to details"]);
  });

  it("a refusal after a failed track change keeps its Back to previous tracks label", () => {
    render(<RefusalNotice copy={REFUSAL_COPY["no-sources"]} item={item} onRetry={vi.fn()} retryLabel="Back to previous tracks" onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Back to previous tracks" })).toBeInTheDocument();
  });

  it("desktop only has Back to details as its only action, reached by Tab", async () => {
    const onBack = vi.fn();
    render(<DesktopOnlyNotice item={item} onBack={onBack} />);
    expect(screen.getByRole("heading", { level: 1, name: DESKTOP_ONLY_COPY.title })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    await expectOrder(["Back to details"]);
    expect(screen.getByRole("button", { name: "Back to details" })).toHaveClass("ui-button--primary");
  });

  it("cannot start shows a filtered reason, the item once known, and Retry then Back", async () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    const { container } = render(<PlayerUnavailableNotice reason="no libmpv at /usr/lib/x/y.so" context="Arrival" onRetry={onRetry} onBack={onBack} />);
    expect(container).toHaveTextContent("The player cannot start");
    expect(container).toHaveTextContent("[path]");
    expect(container.querySelector(".ui-notice-context")).toHaveTextContent("Arrival");
    await expectOrder(["Retry", "Back to details"]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onBack).toHaveBeenCalled();
  });

  it("cannot start has no context line before the item is known", () => {
    const { container } = render(<PlayerUnavailableNotice reason="x" onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(container.querySelector(".ui-notice-context")).toBeNull();
  });

  it("an item load failure says so without the transport message", async () => {
    const { container } = render(<ItemLoadNotice onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Couldn't load this item" })).toBeInTheDocument();
    expect(container.querySelector(".ui-notice-body")).toBeNull();
    await expectOrder(["Retry", "Back to details"]);
  });

  it("a gone item offers Go home and no Retry", () => {
    render(<ItemGoneScreen onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "This item is no longer on the server" })).toBeInTheDocument();
    expect(screen.getByText("It may have been removed or renamed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveClass("ui-button--primary");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("a playback error has Retry, busy while retrying, and Back to details", async () => {
    const { rerender } = render(<PlaybackErrorNotice item={item} serverName="Hearth" message="Decoder failed" retryLabel="Retry" onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Playback could not start" })).toBeInTheDocument();
    expect(screen.getByText("Decoder failed")).toBeInTheDocument();
    await expectOrder(["Retry", "Back to details"]);
    rerender(<PlaybackErrorNotice item={item} serverName="Hearth" message="Decoder failed" retryLabel="Retry" retrying onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  });

  it.each([
    ["network", "Couldn't reach Hearth. Check that the server is on, then try again."],
    ["server", "Hearth had a problem starting playback. Try again in a moment."],
    ["request", "Something went wrong starting playback. Try again."],
  ] as const)("a %s failure shows plain copy, never the transport message, also while retrying", (kind, copy) => {
    const raw = "Request failed with status code 500 / Network Error / timeout of 30000ms exceeded";
    const { container, rerender } = render(<PlaybackErrorNotice item={item} serverName="Hearth" kind={kind} message={raw} retryLabel="Retry" onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(copy)).toBeInTheDocument();
    rerender(<PlaybackErrorNotice item={item} serverName="Hearth" kind={kind} message={raw} retryLabel="Retry" retrying onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(copy)).toBeInTheDocument();
    for (const text of ["Request failed", "Network Error", "timeout of"]) expect(container).not.toHaveTextContent(text);
  });
});
