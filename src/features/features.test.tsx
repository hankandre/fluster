import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BrowseView } from "./browse";
import { DetailView } from "./detail";
import { FeatureIndex } from "./index";
import { HomeView } from "./home";
import { PlayerFeatureView } from "./player";

afterEach(cleanup);

it.each([
  ["Home", HomeView],
  ["Browse", BrowseView],
  ["Detail", DetailView],
  ["Player", PlayerFeatureView],
])("renders the %s placeholder with a link back", (name, View) => {
  render(<View />);
  expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to features" })).toHaveAttribute("href", "#/next");
});

it("lists every feature", () => {
  render(<FeatureIndex />);
  expect(screen.getAllByRole("link")).toHaveLength(5);
});
