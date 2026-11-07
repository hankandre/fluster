import { cleanup, render, screen } from "@testing-library/react";
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
  ])("shows Not found for %s instead of the proof of concept", (hash) => {
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
