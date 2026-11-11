import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { SignedInChrome } from "./signed-in-chrome";

afterEach(cleanup);

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderChrome(gateway: SessionGateway, signIn: boolean) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider createGateway={() => gateway}>
        <SignIn gateway={gateway} />
        <SignedInChrome hash="#/next/home"><main><h1>Page</h1></main></SignedInChrome>
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
});
