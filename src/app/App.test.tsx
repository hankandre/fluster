import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(cleanup);

describe("App routing", () => {
  it.each([
    "#/next/browse/",
    "#/next/series/%E0%A4%A",
    "#/next/unknown/thing",
    "#/next/browse/a/b",
    "#/next/",
  ])("shows Not found for %s instead of the proof of concept", (hash) => {
    window.location.hash = hash;
    render(<App />);
    expect(screen.getByRole("heading", { name: "Not found" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Back to features" })).toHaveAttribute("href", "#/next");
  });
});
