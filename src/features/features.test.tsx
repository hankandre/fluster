import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../app/session";
import { BrowseView } from "./browse";
import { DetailView } from "./detail";
import { FeatureIndex } from "./index";
import { HomeView } from "./home";
import { PlayerFeatureView } from "./player";
import { fakeSessionGateway } from "../test/fake-session-gateway";

afterEach(cleanup);

function stubGateway(): SessionGateway {
  return fakeSessionGateway({
    userViews: vi.fn().mockResolvedValue([]),
    resumeItems: vi.fn().mockResolvedValue([]),
    nextUp: vi.fn().mockResolvedValue([]),
    latestInLibrary: vi.fn().mockResolvedValue([]),
    imageUrl: vi.fn().mockReturnValue(""),
  });
}

function SignedIn({ gateway, label = "test sign in" }: { gateway: SessionGateway; label?: string }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>{label}</button>;
}

it("signs out from Home: revokes the server session and returns to sign-in", async () => {
  const gateway = stubGateway();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider createGateway={() => gateway}>
        <SignedIn gateway={gateway} />
        <HomeView />
      </SessionProvider>
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  });
  expect(gateway.logout).toHaveBeenCalledTimes(1);
  expect(window.location.hash).toBe("#/next/sign-in");
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
});

it("logs out the previous gateway once when another one signs in", () => {
  const first = stubGateway();
  const second = stubGateway();
  render(
    <SessionProvider createGateway={() => first}>
      <SignedIn gateway={first} label="first" />
      <SignedIn gateway={second} label="second" />
    </SessionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "first" }));
  fireEvent.click(screen.getByRole("button", { name: "second" }));
  expect(first.logout).toHaveBeenCalledTimes(1);
  expect(second.logout).not.toHaveBeenCalled();
});

it.each([
  ["Browse", BrowseView],
  ["Detail", DetailView],
  ["Player", PlayerFeatureView],
])("renders the %s placeholder with a link back", (name, View) => {
  render(<SessionProvider createGateway={() => stubGateway()}><View /></SessionProvider>);
  expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to features" })).toHaveAttribute("href", "#/next");
});

it("lists every feature", () => {
  render(<SessionProvider createGateway={() => stubGateway()}><FeatureIndex /></SessionProvider>);
  expect(screen.getAllByRole("link")).toHaveLength(7);
});
