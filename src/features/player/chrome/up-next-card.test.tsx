import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextEpisode } from "../../../domain/catalog";
import { countdownText, UpNextCard, upNextAnnouncement } from "./up-next-card";

const next: NextEpisode = {
  id: "e2",
  title: "Second",
  label: "S1 · E2",
  image: { itemId: "e2", type: "Primary", tag: "t" },
};

function card(overrides: Partial<Parameters<typeof UpNextCard>[0]> = {}) {
  const props = {
    next,
    stillSrc: "https://media.test/Items/e2/Images/Primary?tag=t",
    secondsLeft: 10,
    totalSeconds: 10,
    paused: false,
    onPlayNow: vi.fn(),
    onHide: vi.fn(),
    ...overrides,
  };
  return { props, element: <UpNextCard {...props} /> };
}

afterEach(cleanup);

describe("UpNextCard", () => {
  it("shows the still, the meta line, and the title", () => {
    const { element } = card();
    const { container } = render(element);
    const img = container.querySelector(".up-next-still img");
    expect(img).toHaveAttribute("src", "https://media.test/Items/e2/Images/Primary?tag=t");
    expect(img).toHaveAttribute("alt", "");
    expect(container.querySelector(".up-next-still")).toHaveAttribute("data-fit", "cover");
    expect(screen.getByText("Up next · S1 · E2")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("shows a series poster whole", () => {
    const { element } = card({ next: { ...next, image: { itemId: "series-1", type: "Primary", tag: "sp" } } });
    const { container } = render(element);
    expect(container.querySelector(".up-next-still")).toHaveAttribute("data-fit", "contain");
  });

  it("draws no frame without an image and says only Up next without a label", () => {
    const { element } = card({ next: { id: "e2", title: "Second" }, stillSrc: undefined });
    const { container } = render(element);
    expect(container.querySelector(".up-next-still")).toBeNull();
    expect(screen.getByText("Up next")).toBeInTheDocument();
  });

  it("calls Play now and Hide", () => {
    const { element, props } = card();
    render(element);
    fireEvent.click(screen.getByRole("button", { name: "Play now" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(props.onPlayNow).toHaveBeenCalledTimes(1);
    expect(props.onHide).toHaveBeenCalledTimes(1);
  });

  it("follows the paused prop and sets the fill duration", () => {
    const { element } = card();
    const { container, rerender } = render(element);
    const aside = container.querySelector(".up-next-card") as HTMLElement;
    expect(aside).not.toHaveAttribute("data-paused");
    expect(aside.style.getPropertyValue("--up-next-seconds")).toBe("10s");
    rerender(card({ paused: true }).element);
    expect(aside).toHaveAttribute("data-paused", "true");
  });

  it("speaks the appearance", () => {
    const { element } = card();
    render(element);
    expect(screen.getByRole("status")).toHaveTextContent("Up next: Second, playing in 10 seconds");
  });

  it("changes the live region at most twice over a full countdown", () => {
    const seen: string[] = [];
    const { rerender } = render(card({ secondsLeft: 10 }).element);
    for (let seconds = 10; seconds >= 0; seconds -= 1) {
      rerender(card({ secondsLeft: seconds }).element);
      act(() => undefined);
      const text = within(screen.getByLabelText("Up next")).getByRole("status").textContent ?? "";
      if (text) seen.push(text);
    }
    expect(new Set(seen)).toEqual(new Set([
      "Up next: Second, playing in 10 seconds",
      "Up next: Second, playing in 5 seconds",
    ]));
  });

  it("keeps the countdown text in the DOM but out of the live region", () => {
    render(card({ secondsLeft: 6 }).element);
    expect(screen.getByText("Playing in 6 seconds")).not.toHaveAttribute("role");
  });
});

describe("up next text", () => {
  it("counts in the singular at one second", () => {
    expect(countdownText(1)).toBe("Playing in 1 second");
    expect(countdownText(2)).toBe("Playing in 2 seconds");
  });

  it("announces the full countdown above 5 s and 5 s from then on", () => {
    expect(upNextAnnouncement("Second", 10, 10)).toBe("Up next: Second, playing in 10 seconds");
    expect(upNextAnnouncement("Second", 6, 10)).toBe("Up next: Second, playing in 10 seconds");
    expect(upNextAnnouncement("Second", 5, 10)).toBe("Up next: Second, playing in 5 seconds");
    expect(upNextAnnouncement("Second", 1, 10)).toBe("Up next: Second, playing in 5 seconds");
    expect(upNextAnnouncement("Second", 8, 15)).toBe("Up next: Second, playing in 15 seconds");
  });
});
