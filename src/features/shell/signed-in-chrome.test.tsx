import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { LEAVE_APP_EVENT } from "./leave-app";
import { initialOf, SignedInChrome } from "./signed-in-chrome";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
  delete document.documentElement.dataset.tvPlatform;
});

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderChrome(gateway: SessionGateway, signIn: boolean, hash = "#/next/home") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider createGateway={() => gateway}>
        <SignIn gateway={gateway} />
        <SignedInChrome hash={hash}><main><h1>Page</h1></main></SignedInChrome>
      </SessionProvider>
    </QueryClientProvider>,
  );
  if (signIn) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
    });
  }
}

describe("SignedInChrome", () => {
  it("renders no nav while signed out", async () => {
    await renderChrome(fakeSessionGateway(), false);
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page" })).toBeInTheDocument();
  });

  it("passes the user's initial to the nav, and none when the name is unknown", async () => {
    await renderChrome(fakeSessionGateway({ currentUserName: vi.fn(() => "tester") }), true);
    expect(document.querySelector(".app-nav-initial")).toHaveTextContent("T");
    cleanup();
    await renderChrome(fakeSessionGateway({ currentUserName: vi.fn(() => undefined) }), true);
    expect(document.querySelector(".app-nav-initial")).toBeNull();
  });

  it.each(["#/next/home", "#/next/search", "#/next/settings", "#/next/browse/lib-1"])("shows no Back button on the root screen %s", async (hash) => {
    await renderChrome(fakeSessionGateway(), true, hash);
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it.each(["#/next/item/m1", "#/next/series/s1", "#/next/collection/c1"])("shows a Back button on the non-root screen %s", async (hash) => {
    await renderChrome(fakeSessionGateway(), true, hash);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("goes back through the same function as Escape", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    await renderChrome(fakeSessionGateway(), true, "#/next/item/m1");
    // An in-app hash change marks the tab as having navigated, so Back uses history.
    window.location.hash = "#/next/item/m1";
    await new Promise((resolve) => setTimeout(resolve, 20));
    const button = screen.getByRole("button", { name: "Back" });
    fireEvent.click(button);
    expect(back).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(back).toHaveBeenCalledTimes(2);
    back.mockRestore();
  });

  it("takes the first letter of a name", () => {
    expect(initialOf("  marc")).toBe("M");
    expect(initialOf("Émile")).toBe("É");
    expect(initialOf("")).toBeUndefined();
    expect(initialOf(undefined)).toBeUndefined();
  });

  it("shows the libraries from the gateway", async () => {
    const gateway = fakeSessionGateway({ userViews: vi.fn().mockResolvedValue([{ id: "lib-1", name: "Movies" }]) });
    await renderChrome(gateway, true);
    expect(await screen.findByRole("link", { name: "Movies" })).toHaveAttribute("href", "#/next/browse/lib-1");
  });

  it("keeps the fixed entries and shows no error text when libraries fail", async () => {
    const gateway = fakeSessionGateway({ userViews: vi.fn().mockRejectedValue(new Error("boom")) });
    await renderChrome(gateway, true);
    await waitFor(() => expect(gateway.userViews).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search" })).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens Search when / is pressed on a signed-in page", async () => {
    window.location.hash = "#/next/home";
    await renderChrome(fakeSessionGateway(), true);
    fireEvent.keyDown(screen.getByRole("heading", { name: "Page" }), { key: "/" });
    expect(window.location.hash).toBe("#/next/search");
  });

  it("leaves at once from the Home tab on the browser TV form", async () => {
    document.documentElement.dataset.form = "tv";
    window.location.hash = "#/next/home";
    const leave = vi.fn();
    window.addEventListener(LEAVE_APP_EVENT, leave);
    await renderChrome(fakeSessionGateway(), true);
    const home = screen.getByRole("link", { name: "Home" });
    home.focus();
    fireEvent.keyDown(home, { key: "Escape" });
    window.removeEventListener(LEAVE_APP_EVENT, leave);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks Leave Fluster? on a platform that confirms", async () => {
    document.documentElement.dataset.form = "tv";
    document.documentElement.dataset.tvPlatform = "tizen";
    window.location.hash = "#/next/home";
    const leave = vi.fn();
    window.addEventListener(LEAVE_APP_EVENT, leave);
    await renderChrome(fakeSessionGateway(), true);
    const home = screen.getByRole("link", { name: "Home" });
    home.focus();
    fireEvent.keyDown(home, { key: "Escape" });
    const dialog = await screen.findByRole("alertdialog", { name: "Leave Fluster?" });
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Stay" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(leave).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("link", { name: "Home" }), { key: "Escape" });
    fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
    window.removeEventListener(LEAVE_APP_EVENT, leave);
    expect(leave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
