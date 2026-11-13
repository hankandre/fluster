import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppNav } from "./app-nav";
import { AppShell, useNavOverHero } from "./app-shell";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset.form;
  setScroll(0);
});
beforeEach(() => {
  window.location.hash = "#/next/home";
});

function renderShell(main = <main><h1>Page</h1><button type="button">Content control</button></main>) {
  return render(<AppShell nav={<AppNav libraries={[]} hash="#/next/home" />}>{main}</AppShell>);
}

describe("AppShell", () => {
  it("tabs from the skip link to the current nav entry, then to content", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.tab();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Content control" })).toHaveFocus();
  });

  it("focuses main from the skip link without changing the hash", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("link", { name: "Skip to content" }));
    const main = screen.getByRole("main");
    expect(main).toHaveFocus();
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(window.location.hash).toBe("#/next/home");
  });

  it("keeps a tabindex the view already set on main", async () => {
    const user = userEvent.setup();
    renderShell(<main tabIndex={0}><h1>Page</h1></main>);
    await user.click(screen.getByRole("link", { name: "Skip to content" }));
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("sets scroll-padding-top on the document scroller so the sticky nav never covers focus", () => {
    const css = readFileSync("src/features/shared/ui/shell.css", "utf8");
    expect(css).toMatch(/:root\s*\{[^}]*scroll-padding-top:\s*var\(--nav-h\)/);
    expect(css).not.toMatch(/\.app-frame\s*\{[^}]*scroll-padding-top/);
  });
});

function setScroll(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
}

function Hero() {
  useNavOverHero();
  return <section aria-label="Hero" />;
}

function scrollTo(y: number) {
  setScroll(y);
  act(() => {
    fireEvent.scroll(window);
    vi.advanceTimersByTime(32);
  });
}

describe("AppShell nav surface and hiding", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setScroll(0);
  });

  const header = () => screen.getByRole("banner");

  it("is clear over a mounted hero at the top and glass once the page scrolls", () => {
    renderShell(<main><Hero /></main>);
    expect(header()).toHaveAttribute("data-surface", "clear");
    scrollTo(10);
    expect(header()).toHaveAttribute("data-surface", "glass");
    scrollTo(0);
    expect(header()).toHaveAttribute("data-surface", "clear");
  });

  it("is glass with no hero", () => {
    renderShell();
    expect(header()).toHaveAttribute("data-surface", "glass");
  });

  it("hides on a downward scroll past the threshold and returns on an upward scroll", () => {
    renderShell();
    scrollTo(60);
    expect(header()).toHaveAttribute("data-hidden", "false");
    scrollTo(400);
    expect(header()).toHaveAttribute("data-hidden", "true");
    scrollTo(380);
    expect(header()).toHaveAttribute("data-hidden", "false");
  });

  it("does not hide while focus is in the header", () => {
    renderShell();
    screen.getByRole("link", { name: "Home" }).focus();
    scrollTo(400);
    expect(header()).toHaveAttribute("data-hidden", "false");
  });

  it("shows again when focus moves into a hidden header", () => {
    renderShell();
    scrollTo(400);
    expect(header()).toHaveAttribute("data-hidden", "true");
    act(() => screen.getByRole("link", { name: "Home" }).focus());
    expect(header()).toHaveAttribute("data-hidden", "false");
  });

  it("never hides in the TV form", () => {
    document.documentElement.dataset.form = "tv";
    renderShell();
    scrollTo(400);
    expect(header()).toHaveAttribute("data-hidden", "false");
  });

  it("hides while focus is in the content and shows when focus is in the header (TV form)", () => {
    document.documentElement.dataset.form = "tv";
    renderShell();
    act(() => screen.getByRole("button", { name: "Content control" }).focus());
    expect(header()).toHaveAttribute("data-hidden", "true");
    act(() => screen.getByRole("link", { name: "Home" }).focus());
    expect(header()).toHaveAttribute("data-hidden", "false");
  });

  it("does not hide on content focus on desktop", () => {
    renderShell();
    act(() => screen.getByRole("button", { name: "Content control" }).focus());
    expect(header()).toHaveAttribute("data-hidden", "false");
  });
});
