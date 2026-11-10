import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppNav } from "./app-nav";
import { AppShell } from "./app-shell";

afterEach(cleanup);
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
});
