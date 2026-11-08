import { act, cleanup, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ambientFadeMs, AmbientBackdrop } from "./ambient-backdrop";

function mockMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

// DC term encodes a saturated orange.
const A = "00QY9j";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AmbientBackdrop", () => {
  it("sets the art custom properties on its container, defaulting without a hash", () => {
    mockMotion(false);
    const { rerender } = render(<AmbientBackdrop imageKey="a" />);
    const root = screen.getByTestId("ambient-backdrop");
    expect(root.style.getPropertyValue("--art-accent")).toBe("#e8c48a");
    rerender(<AmbientBackdrop imageKey="b" blurHash={A} src="/b.jpg" />);
    expect(root.style.getPropertyValue("--art-accent")).toMatch(/^#[0-9a-f]{6}$/);
    expect(root.style.getPropertyValue("--art-accent")).not.toBe("#e8c48a");
    expect(root.style.getPropertyValue("--art-glow")).toMatch(/\/ 0\.22\)$/);
    expect(root.style.getPropertyValue("--art-shade")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("crossfades: keeps both layers, marks the new one entering, then drops the old after --dur-slow", () => {
    mockMotion(false);
    const { rerender } = render(<AmbientBackdrop imageKey="a" src="/a.jpg" />);
    rerender(<AmbientBackdrop imageKey="b" src="/b.jpg" />);
    const layers = screen.getAllByTestId("ambient-layer");
    expect(layers.map((l) => l.dataset.key)).toEqual(["a", "b"]);
    expect(layers[1]).toHaveAttribute("data-entering", "true");
    expect(layers[0]).not.toHaveAttribute("data-entering");
    act(() => vi.advanceTimersByTime(ambientFadeMs()));
    expect(screen.getAllByTestId("ambient-layer").map((l) => l.dataset.key)).toEqual(["b"]);
  });

  it("swaps instantly with reduced motion", () => {
    mockMotion(true);
    const { rerender } = render(<AmbientBackdrop imageKey="a" src="/a.jpg" />);
    rerender(<AmbientBackdrop imageKey="b" src="/b.jpg" />);
    const layers = screen.getAllByTestId("ambient-layer");
    expect(layers.map((l) => l.dataset.key)).toEqual(["b"]);
    expect(layers[0]).not.toHaveAttribute("data-entering");
  });

  it("reads the fade duration from --dur-slow", () => {
    document.documentElement.style.setProperty("--dur-slow", "300ms");
    expect(ambientFadeMs()).toBe(300);
    document.documentElement.style.setProperty("--dur-slow", "0.2s");
    expect(ambientFadeMs()).toBe(200);
    document.documentElement.style.removeProperty("--dur-slow");
    expect(ambientFadeMs()).toBe(480);
  });

  it("drops a broken image but keeps the layer and its BlurHash", () => {
    mockMotion(false);
    render(<AmbientBackdrop imageKey="a" src="/broken.jpg" blurHash={A} />);
    const layer = screen.getByTestId("ambient-layer");
    fireEvent.error(layer.querySelector("img") as HTMLImageElement);
    expect(layer.querySelector("img")).toBeNull();
    expect(screen.getByTestId("ambient-layer")).toBeInTheDocument();
  });

  it("renders children above the layers", () => {
    mockMotion(false);
    render(<AmbientBackdrop imageKey="a"><p>content</p></AmbientBackdrop>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
