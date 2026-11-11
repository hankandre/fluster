import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppNav } from "./app-nav";

afterEach(cleanup);

const LIBRARIES = [{ id: "lib-1", name: "Movies" }, { id: "lib 2", name: "Shows" }];

function renderNav(hash: string) {
  return render(<AppNav libraries={LIBRARIES} hash={hash} />);
}

const names = () => screen.getAllByRole("link").map((link) => link.getAttribute("aria-label") ?? link.textContent);
const current = () => screen.queryAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.getAttribute("aria-label") ?? l.textContent);

describe("AppNav", () => {
  it("lists the wordmark, Home, libraries in order, Search, and Settings", () => {
    renderNav("#/next/home");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(names()).toEqual(["Fluster", "Home", "Movies", "Shows", "Search", "Settings"]);
    expect(screen.getByRole("link", { name: "Shows" })).toHaveAttribute("href", "#/next/browse/lib%202");
  });

  it.each([
    ["#/next/home", ["Home"]],
    ["#/next/browse/lib-1", ["Movies"]],
    ["#/next/browse/lib%202", ["Shows"]],
    ["#/next/search", ["Search"]],
    ["#/next/search/arrival", ["Search"]],
    ["#/next/settings", ["Settings"]],
    ["#/next/browse", []],
    ["#/next/browse/", []],
    ["#/next/item/m1", []],
    ["#/next/series/s1", []],
    ["#/next/collection/c1", []],
    ["#/next/detail", []],
    ["#/next/nope", []],
  ])("marks %s current: %j", (hash, expected) => {
    renderNav(hash);
    expect(current()).toEqual(expected);
  });

  it("never marks the wordmark current", () => {
    renderNav("#/next/home");
    expect(screen.getByRole("link", { name: "Fluster" })).not.toHaveAttribute("aria-current");
  });

  it("shows only the fixed entries while libraries are unavailable", () => {
    render(<AppNav libraries={undefined} hash="#/next/home" />);
    expect(names()).toEqual(["Fluster", "Home", "Search", "Settings"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("puts the Tab stop on the current entry, or on Home", () => {
    const { unmount } = renderNav("#/next/search");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("tabindex", "-1");
    unmount();
    renderNav("#/next/item/m1");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("tabindex", "0");
  });

  it("moves between entries with the arrow, Home, and End keys", () => {
    renderNav("#/next/home");
    const home = screen.getByRole("link", { name: "Home" });
    home.focus();
    fireEvent.keyDown(home, { key: "ArrowRight" });
    expect(screen.getByRole("link", { name: "Movies" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(screen.getByRole("link", { name: "Fluster" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(screen.getByRole("link", { name: "Fluster" })).toHaveFocus();
  });

  describe("overflow fade", () => {
    function stubMetrics(list: HTMLElement, metrics: { scrollLeft: number; clientWidth: number; scrollWidth: number }) {
      for (const [key, value] of Object.entries(metrics)) Object.defineProperty(list, key, { configurable: true, value });
    }
    const list = () => document.querySelector<HTMLElement>(".app-nav-list")!;

    it("is none when everything fits", () => {
      renderNav("#/next/home");
      expect(list()).toHaveAttribute("data-overflow", "none");
    });

    it("marks the hidden edges after a scroll", () => {
      renderNav("#/next/home");
      stubMetrics(list(), { scrollLeft: 0, clientWidth: 300, scrollWidth: 600 });
      fireEvent.scroll(list());
      expect(list()).toHaveAttribute("data-overflow", "end");
      stubMetrics(list(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 600 });
      fireEvent.scroll(list());
      expect(list()).toHaveAttribute("data-overflow", "both");
      stubMetrics(list(), { scrollLeft: 300, clientWidth: 300, scrollWidth: 600 });
      fireEvent.scroll(list());
      expect(list()).toHaveAttribute("data-overflow", "start");
      stubMetrics(list(), { scrollLeft: 0, clientWidth: 600, scrollWidth: 600.5 });
      fireEvent.scroll(list());
      expect(list()).toHaveAttribute("data-overflow", "none");
    });

    it("measures again when the libraries arrive", () => {
      const { rerender } = render(<AppNav libraries={undefined} hash="#/next/home" />);
      stubMetrics(list(), { scrollLeft: 0, clientWidth: 100, scrollWidth: 400 });
      rerender(<AppNav libraries={LIBRARIES} hash="#/next/home" />);
      expect(list()).toHaveAttribute("data-overflow", "end");
    });
  });

  it("follows the link with Enter", async () => {
    const user = userEvent.setup();
    renderNav("#/next/home");
    screen.getByRole("link", { name: "Movies" }).focus();
    await user.keyboard("{Enter}");
    expect(window.location.hash).toBe("#/next/browse/lib-1");
  });

  describe("scrolling the current entry into view", () => {
    const calls: Array<{ left?: number; behavior?: string }> = [];

    function stubLayout() {
      calls.length = 0;
      Element.prototype.scrollTo = vi.fn((options: ScrollToOptions) => {
        calls.push({ left: options.left, behavior: options.behavior });
      }) as unknown as typeof Element.prototype.scrollTo;
      // A 200px-wide list whose entries are 100px wide: the entry at index n starts at n * 100.
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 100 });
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 200 });
      Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
        configurable: true,
        get(this: HTMLElement) {
          return Array.from(this.parentElement?.children ?? []).indexOf(this) * 100;
        },
      });
    }

    afterEach(() => {
      delete (Element.prototype as { scrollTo?: unknown }).scrollTo;
      delete (HTMLElement.prototype as { offsetWidth?: unknown }).offsetWidth;
      delete (HTMLElement.prototype as { clientWidth?: unknown }).clientWidth;
      delete (HTMLElement.prototype as { offsetLeft?: unknown }).offsetLeft;
      window.matchMedia = undefined as unknown as typeof window.matchMedia;
    });

    it("scrolls an off-screen current entry into view on mount and when the page changes", () => {
      stubLayout();
      const { rerender } = renderNav("#/next/search");
      // Search is child index 4 (offsetLeft 400, width 100): its right edge 500 needs scrollLeft 300.
      expect(calls).toEqual([{ left: 300, behavior: "smooth" }]);
      rerender(<AppNav libraries={LIBRARIES} hash="#/next/home" />);
      // Home (offsetLeft 100) is already in view at scrollLeft 0: no new scroll.
      expect(calls).toHaveLength(1);
    });

    it("does not animate under reduced motion", () => {
      stubLayout();
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
      renderNav("#/next/search");
      expect(calls).toEqual([{ left: 300, behavior: "auto" }]);
    });
  });
});
