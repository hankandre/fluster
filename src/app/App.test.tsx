import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";

afterEach(cleanup);

describe("App routing", () => {
  it.each([
    "#/next/browse",
    "#/next/browse/",
    "#/next/series/%E0%A4%A",
    "#/next/item/%E0%A4%A",
    "#/next/item/",
    "#/next/unknown/thing",
    "#/next/browse/a/b",
    "#/next/",
    "#/next/play/",
    "#/next/play/m1?start=abc",
  ])("shows Not found for %s", (hash) => {
    window.location.hash = hash;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Not found" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "#/next/home");
  });
});

describe("App entry", () => {
  function renderApp() {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    );
  }

  it.each(["", "#", "#/", "#/sign-in", "#/nextfoo", "#/play/m1"])(
    "sends %j to Home, which sends a signed-out visitor to sign-in",
    async (hash) => {
      window.location.hash = hash;
      renderApp();
      await waitFor(() => expect(window.location.hash).toBe("#/next/sign-in"));
      expect(screen.getByLabelText("Server URL")).toHaveAttribute("type", "url");
    },
  );

  it("labels browser development mode", () => {
    window.location.hash = "#/next/sign-in";
    renderApp();
    expect(screen.getByText("Browser development mode")).toBeInTheDocument();
  });

  it("shows the UI gallery in browser development mode without signing in", async () => {
    window.location.hash = "#/next/gallery";
    renderApp();
    expect(await screen.findByRole("heading", { name: "UI gallery" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Streaming limit/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/next/gallery");
  });

  it("mounts one toast region, on a normal route and in the gallery", async () => {
    window.location.hash = "#/next/sign-in";
    const { unmount } = renderApp();
    expect(document.querySelectorAll(".ui-toast-region")).toHaveLength(1);
    unmount();

    window.location.hash = "#/next/gallery";
    renderApp();
    await screen.findByRole("heading", { name: "UI gallery" });
    expect(document.querySelectorAll(".ui-toast-region")).toHaveLength(1);
  });

  it("raises gallery toasts through the root provider, and drops them on a player route", async () => {
    window.location.hash = "#/next/gallery";
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Show error toast" }));
    const region = document.querySelector<HTMLElement>(".ui-toast-region") as HTMLElement;
    expect(region).toHaveTextContent("Couldn't update watched state. Try again.");

    act(() => {
      window.location.hash = "#/next/play/m1";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.querySelectorAll(".ui-toast-region")).toHaveLength(1);
    expect(document.querySelector(".ui-toast-region")).not.toHaveTextContent("Couldn't update watched state");
  });
});
