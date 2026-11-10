import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
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

  it("follows the link with Enter", async () => {
    const user = userEvent.setup();
    renderNav("#/next/home");
    screen.getByRole("link", { name: "Movies" }).focus();
    await user.keyboard("{Enter}");
    expect(window.location.hash).toBe("#/next/browse/lib-1");
  });
});
