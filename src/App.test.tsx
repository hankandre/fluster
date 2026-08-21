import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { App } from "./App";

it("starts with manual server connection and an explicit browser-mode label", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  expect(screen.getByRole("heading", { name: /Connect your Jellyfin library/i })).toBeInTheDocument();
  expect(screen.getByText("Browser development mode")).toBeInTheDocument();
  expect(screen.getByText(/access tokens remain in memory/i)).toBeInTheDocument();
});
