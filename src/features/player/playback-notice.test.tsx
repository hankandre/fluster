import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackNotice } from "./playback-notice";

// jsdom has no canvas, so the BlurHash decoder is stubbed.
vi.mock("../home/blurhash", () => ({ blurhashToDataUrl: () => "data:image/png;base64,AAAA" }));

afterEach(cleanup);

function setup(props: Partial<Parameters<typeof PlaybackNotice>[0]> = {}) {
  const handlers = { retry: vi.fn(), back: vi.fn(), escape: vi.fn() };
  const view = render(
    <PlaybackNotice
      title="Playback could not start"
      context="Arrival"
      retry={{ label: "Retry", onActivate: handlers.retry }}
      back={{ label: "Back to details", onActivate: handlers.back }}
      onEscape={handlers.escape}
      {...props}
    >
      It broke.
    </PlaybackNotice>,
  );
  return { ...handlers, ...view };
}

describe("PlaybackNotice", () => {
  it("draws the backdrop with its placeholder under the scrim, and the Notice layout", () => {
    const { container } = setup({ backdrop: { src: "https://img.test/b.jpg", blurHash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" } });
    const img = container.querySelector(".playback-notice-art img");
    expect(img).toHaveAttribute("src", "https://img.test/b.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(container.querySelector<HTMLElement>(".playback-notice-art")?.style.backgroundImage).toContain("data:");
    expect(container.querySelector(".playback-notice-scrim")).not.toBeNull();
    expect(container.querySelector(".ui-notice-title")).toHaveTextContent("Playback could not start");
    expect(container.querySelector(".ui-notice-context")).toHaveTextContent("Arrival");
  });

  it("has no art layer without a backdrop and no context line without a context", () => {
    const { container } = setup({ context: undefined });
    expect(container.querySelector(".playback-notice-art")).toBeNull();
    expect(container.querySelector(".ui-notice-context")).toBeNull();
  });

  it("focuses the heading, then tabs to Retry and Back to details", async () => {
    setup();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Back to details" })).toHaveFocus();
  });

  it("moves with the arrow keys", () => {
    setup();
    const retry = screen.getByRole("button", { name: "Retry" });
    const back = screen.getByRole("button", { name: "Back to details" });
    fireEvent.keyDown(screen.getByRole("heading", { level: 1 }), { key: "ArrowDown" });
    expect(retry).toHaveFocus();
    fireEvent.keyDown(retry, { key: "ArrowRight" });
    expect(back).toHaveFocus();
    fireEvent.keyDown(back, { key: "ArrowRight" });
    expect(back).toHaveFocus();
    fireEvent.keyDown(back, { key: "ArrowLeft" });
    expect(retry).toHaveFocus();
    screen.getByRole("heading", { level: 1 }).focus();
    fireEvent.keyDown(screen.getByRole("heading", { level: 1 }), { key: "ArrowRight" });
    expect(retry).toHaveFocus();
  });

  it("disables a busy Retry, calls Escape, and renders What you can do with a bold lead", () => {
    const { escape, container } = setup({ retry: { label: "Retry", onActivate: vi.fn(), busy: true }, whatYouCanDo: "Ask the admin." });
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(container.querySelector(".ui-notice-help strong")).toHaveTextContent("What you can do:");
    expect(container.querySelector(".ui-notice-help")).toHaveTextContent("Ask the admin.");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(escape).toHaveBeenCalledTimes(1);
  });

  it("makes Back to details the primary action when there is no Retry, and can be a link", () => {
    setup({ retry: undefined, back: { label: "Go home", href: "#/next/home" } });
    expect(screen.getByRole("link", { name: "Go home" })).toHaveClass("ui-button--primary");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
