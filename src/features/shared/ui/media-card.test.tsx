import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artTint } from "../art-tint";
import { HOLD_MS } from "../hold-key";
import { MediaCard } from "./media-card";

vi.mock("../../home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

afterEach(cleanup);

const HASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

describe("MediaCard variants", () => {
  it.each(["poster", "thumb", "episode", "library"] as const)("renders the %s variant", (variant) => {
    render(<MediaCard variant={variant} title="Arrival" href="#/x" />);
    const link = screen.getByRole("link", { name: "Arrival" });
    expect(link).toHaveAttribute("data-variant", variant);
    expect(link).toHaveAttribute("data-media-card");
    expect(link.querySelector(".media-card-frame")).toHaveAttribute("data-variant", variant);
  });

  it("is a link in the roving set when it has an href, otherwise an article", () => {
    const { rerender } = render(<MediaCard variant="poster" title="Arrival" href="#/x" />);
    expect(screen.getByRole("link", { name: "Arrival" })).toHaveAttribute("data-roving-item");
    rerender(<MediaCard variant="poster" title="Arrival" />);
    expect(screen.getByRole("article", { name: "Arrival" })).not.toHaveAttribute("data-roving-item");
  });
});

describe("MediaCard accessible name", () => {
  it("joins subtitle, spoken time left, watched, and unwatched count", () => {
    render(
      <MediaCard
        variant="thumb"
        title="Show"
        subtitle="S1E2"
        progress={0.5}
        remainingTicks={38 * 600_000_000}
        played
        unplayedCount={3}
        href="#/x"
      />,
    );
    expect(screen.getByRole("link", { name: "Show, S1E2, 38 minutes left, watched, 3 unwatched episodes" })).toBeInTheDocument();
  });

  it("hides visible text, marks, and progress from assistive technology", () => {
    const { container } = render(
      <MediaCard variant="poster" title="Show" subtitle="2016" progress={0.5} remainingTicks={600_000_000} played href="#/x" />,
    );
    expect(container.querySelector(".media-card-text")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".media-card-mark")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("card-progress")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".media-card-time")).toHaveTextContent("1 min left");
  });

  it("shows the episode variant with no visible text but the full name", () => {
    const { container } = render(<MediaCard variant="episode" title="Pilot" subtitle="Episode 1" href="#/x" />);
    expect(container.querySelector(".media-card-text")).toBeNull();
    expect(screen.getByRole("link", { name: "Pilot, Episode 1" })).toBeInTheDocument();
  });
});

describe("MediaCard marks and progress", () => {
  it("shows a check when played, and the count otherwise", () => {
    const { container, rerender } = render(<MediaCard variant="poster" title="A" played unplayedCount={4} />);
    expect(container.querySelector(".media-card-mark svg")).not.toBeNull();
    expect(container.querySelector(".media-card-mark")).not.toHaveTextContent("4");
    rerender(<MediaCard variant="poster" title="A" unplayedCount={4} />);
    expect(container.querySelector(".media-card-mark")).toHaveTextContent("4");
    rerender(<MediaCard variant="poster" title="A" unplayedCount={120} />);
    expect(container.querySelector(".media-card-mark")).toHaveTextContent("99+");
    rerender(<MediaCard variant="poster" title="A" />);
    expect(container.querySelector(".media-card-mark")).toBeNull();
  });

  it("draws the fill at the fraction watched, tinted by the art", () => {
    const { container } = render(<MediaCard variant="thumb" title="A" progress={0.25} image={{ blurHash: HASH }} />);
    expect(screen.getByTestId("card-progress").firstElementChild).toHaveStyle({ width: "25%" });
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--art-accent")).toBe(artTint(HASH).accent);
  });

  it("uses the default tint without a hash and draws no progress without progress", () => {
    const { container } = render(<MediaCard variant="thumb" title="A" />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--art-accent")).toBe(artTint(undefined).accent);
    expect(screen.queryByTestId("card-progress")).toBeNull();
  });
});

describe("MediaCard image", () => {
  it("shows the title when there is no image", () => {
    const { container } = render(<MediaCard variant="poster" title="No art" />);
    expect(container.querySelector(".card-image-fallback")).toHaveTextContent("No art");
  });

  it("shows the title and no img after an image error", () => {
    const { container } = render(<MediaCard variant="poster" title="Broken" image={{ src: "https://x/a.webp" }} />);
    expect(container.querySelector(".card-image-fallback")).toBeNull();
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(screen.getByTestId("card-image")).toHaveAttribute("data-state", "error");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".card-image-fallback")).toHaveTextContent("Broken");
  });

  it("shows a blurhash-only image as the placeholder with no img", () => {
    const { container } = render(<MediaCard variant="poster" title="Art" image={{ blurHash: HASH }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("card-image")).toHaveAttribute("data-placeholder", "blurhash");
    expect(screen.getByTestId("card-image")).toHaveAttribute("data-state", "loading");
    expect(container.querySelector(".card-image-fallback")).toBeNull();
  });

  it("marks the image loaded", () => {
    const { container } = render(<MediaCard variant="poster" title="Art" image={{ src: "https://x/a.webp" }} />);
    fireEvent.load(container.querySelector("img") as HTMLImageElement);
    expect(screen.getByTestId("card-image")).toHaveAttribute("data-state", "loaded");
  });
});

describe("MediaCard one-press actions", () => {
  beforeEach(() => {
    window.location.hash = "#/next/home";
  });

  it("calls onActivate on click and on Enter", async () => {
    const onActivate = vi.fn((event: MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    const user = userEvent.setup();
    render(<MediaCard variant="thumb" title="Arrival" href="#/next/play/m1" onActivate={onActivate} />);
    const link = screen.getByRole("link", { name: "Arrival" });
    await user.click(link);
    expect(onActivate).toHaveBeenCalledTimes(1);
    link.focus();
    await user.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("goes to details on i, ContextMenu, and right-click", () => {
    render(<MediaCard variant="thumb" title="Arrival" href="#/next/play/m1" detailsHref="#/next/item/m1" />);
    const link = screen.getByRole("link", { name: "Arrival" });
    fireEvent.keyDown(link, { key: "i" });
    expect(window.location.hash).toBe("#/next/item/m1");
    window.location.hash = "#/next/home";
    fireEvent.keyDown(link, { key: "ContextMenu" });
    expect(window.location.hash).toBe("#/next/item/m1");
    window.location.hash = "#/next/home";
    fireEvent.contextMenu(link);
    expect(window.location.hash).toBe("#/next/item/m1");
  });

  it("ignores i with Ctrl, Meta, or Alt", () => {
    render(<MediaCard variant="thumb" title="Arrival" href="#/next/play/m1" detailsHref="#/next/item/m1" />);
    const link = screen.getByRole("link", { name: "Arrival" });
    fireEvent.keyDown(link, { key: "i", ctrlKey: true });
    fireEvent.keyDown(link, { key: "i", metaKey: true });
    fireEvent.keyDown(link, { key: "i", altKey: true });
    expect(window.location.hash).toBe("#/next/home");
  });

  it("sets aria-keyshortcuts and aria-describedby only when detailsHref is set", () => {
    const { rerender } = render(<MediaCard variant="thumb" title="Arrival" href="#/x" describedBy="hint" />);
    const bare = screen.getByRole("link", { name: "Arrival" });
    expect(bare).not.toHaveAttribute("aria-keyshortcuts");
    expect(bare).not.toHaveAttribute("aria-describedby");
    rerender(<MediaCard variant="thumb" title="Arrival" href="#/x" detailsHref="#/y" describedBy="hint" />);
    const link = screen.getByRole("link", { name: "Arrival" });
    expect(link).toHaveAttribute("aria-keyshortcuts", "i");
    expect(link).toHaveAttribute("aria-describedby", "hint");
  });
});

describe("MediaCard hold OK in the TV form", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.form;
    window.location.hash = "";
  });

  it("plays on a press and opens details on a hold", () => {
    vi.useFakeTimers();
    document.documentElement.dataset.form = "tv";
    const onActivate = vi.fn((event: MouseEvent) => event.preventDefault());
    render(<MediaCard variant="thumb" title="Arrival" href="#/next/play/m1" detailsHref="#/next/item/m1" onActivate={onActivate} />);
    const link = screen.getByRole("link", { name: "Arrival" });
    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.keyUp(link, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(link, { key: "Enter" });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    fireEvent.keyUp(link, { key: "Enter" });
    expect(window.location.hash).toBe("#/next/item/m1");
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("leaves a card without details alone", () => {
    document.documentElement.dataset.form = "tv";
    render(<MediaCard variant="thumb" title="Arrival" href="#/next/play/m1" />);
    expect(fireEvent.keyDown(screen.getByRole("link", { name: "Arrival" }), { key: "Enter" })).toBe(true);
  });
});
