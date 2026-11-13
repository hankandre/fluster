import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEscapeKey } from "../use-escape-key";
import { LEAVE_APP_EVENT } from "./leave-app";
import { useBackKey } from "./use-back-key";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
  delete document.documentElement.dataset.tvPlatform;
  vi.restoreAllMocks();
});
beforeEach(() => {
  window.location.hash = "#/next/home";
});

function Probe({ page, onConfirmLeave }: { page?: () => void; onConfirmLeave?: () => void }) {
  useBackKey(onConfirmLeave);
  return (
    <>
      <nav aria-label="Main">
        <a href="#/next/home" aria-current="page" data-roving-item="" tabIndex={0}>Home</a>
      </nav>
      <main>
        <button type="button">Content</button>
        <input type="text" aria-label="Field" />
        {page ? <Page onEscape={page} /> : null}
      </main>
    </>
  );
}

function Page({ onEscape }: { onEscape: () => void }) {
  useEscapeKey(onEscape);
  return null;
}

describe("useBackKey", () => {
  it("does nothing on a root tab on desktop", () => {
    render(<Probe />);
    const content = screen.getByRole("button", { name: "Content" });
    content.focus();
    expect(fireEvent.keyDown(content, { key: "Escape" })).toBe(true);
    expect(content).toHaveFocus();
  });

  it("focuses the nav's current entry on a root tab in the TV form", () => {
    document.documentElement.dataset.form = "tv";
    render(<Probe />);
    const content = screen.getByRole("button", { name: "Content" });
    content.focus();
    expect(fireEvent.keyDown(content, { key: "Escape" })).toBe(false);
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();
  });

  it("leaves the app on Home when focus is already in the nav", () => {
    document.documentElement.dataset.form = "tv";
    const leave = vi.fn();
    const confirm = vi.fn();
    window.addEventListener(LEAVE_APP_EVENT, leave);
    render(<Probe onConfirmLeave={confirm} />);
    const home = screen.getByRole("link", { name: "Home" });
    home.focus();
    expect(fireEvent.keyDown(home, { key: "Escape" })).toBe(false);
    window.removeEventListener(LEAVE_APP_EVENT, leave);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks first on a platform that confirms", () => {
    document.documentElement.dataset.form = "tv";
    document.documentElement.dataset.tvPlatform = "tizen";
    const leave = vi.fn();
    const confirm = vi.fn();
    window.addEventListener(LEAVE_APP_EVENT, leave);
    render(<Probe onConfirmLeave={confirm} />);
    const home = screen.getByRole("link", { name: "Home" });
    home.focus();
    expect(fireEvent.keyDown(home, { key: "Escape" })).toBe(false);
    window.removeEventListener(LEAVE_APP_EVENT, leave);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
  });

  it("does not leave from the nav on another root tab", () => {
    document.documentElement.dataset.form = "tv";
    window.location.hash = "#/next/library/abc";
    const leave = vi.fn();
    window.addEventListener(LEAVE_APP_EVENT, leave);
    render(<Probe />);
    const home = screen.getByRole("link", { name: "Home" });
    home.focus();
    fireEvent.keyDown(home, { key: "Escape" });
    window.removeEventListener(LEAVE_APP_EVENT, leave);
    expect(leave).not.toHaveBeenCalled();
  });

  it("skips when a page handler already used Escape", () => {
    document.documentElement.dataset.form = "tv";
    const page = vi.fn();
    render(<Probe page={page} />);
    const content = screen.getByRole("button", { name: "Content" });
    content.focus();
    fireEvent.keyDown(content, { key: "Escape" });
    expect(page).toHaveBeenCalled();
    expect(content).toHaveFocus();
  });

  it("goes back on a non-root screen when the tab navigated inside the app", async () => {
    vi.resetModules();
    const fresh = await import("./use-back-key");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    function Fresh() {
      fresh.useBackKey();
      return <button type="button">Content</button>;
    }
    render(<Fresh />);
    window.location.hash = "#/next/item/abc";
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(back).toHaveBeenCalled();
  });

  it("goes Home when the only hash changes were replaces such as redirects", async () => {
    vi.resetModules();
    const fresh = await import("./use-back-key");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    function Fresh() {
      fresh.useBackKey();
      return <button type="button">Content</button>;
    }
    render(<Fresh />);
    window.location.replace("#/next/item/abc");
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/next/home");
  });

  it("goes Home on a non-root screen with no in-app history", async () => {
    vi.resetModules();
    const fresh = await import("./use-back-key");
    window.location.hash = "#/next/item/abc";
    function Fresh() {
      fresh.useBackKey();
      return <button type="button">Content</button>;
    }
    render(<Fresh />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(window.location.hash).toBe("#/next/home");
  });

  it("does nothing while a modal layer is open or in a text field", () => {
    window.location.hash = "#/next/item/abc";
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    render(<><Probe /><div role="dialog" aria-modal="true" /></>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Content" }), { key: "Escape" });
    expect(back).not.toHaveBeenCalled();
    cleanup();
    render(<Probe />);
    fireEvent.keyDown(screen.getByLabelText("Field"), { key: "Escape" });
    expect(back).not.toHaveBeenCalled();
  });

  it("does nothing while a menu is open", () => {
    window.location.hash = "#/next/item/abc";
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    render(<><Probe /><ul className="ui-picker-list" role="menu" /></>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Content" }), { key: "Escape" });
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/next/item/abc");
  });
});
