import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";

afterEach(cleanup);

describe("App routing", () => {
  it.each([
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
    expect(screen.getByRole("link", { name: "Back to features" })).toHaveAttribute("href", "#/next");
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
});
