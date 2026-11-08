import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { ItemDetailView } from "./index";

vi.mock("../home/blurhash", () => ({ blurhashToDataUrl: () => undefined }));

function item(id: string, hash: string): ItemDetail {
  return {
    id,
    type: "Movie",
    title: `Title ${id}`,
    genres: [],
    cast: [],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions: [],
    backdrop: { itemId: id, type: "Backdrop", tag: `bd-${id}`, blurHash: hash },
  };
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

afterEach(cleanup);

describe("item detail backdrop", () => {
  it("keeps the backdrop mounted across items so they crossfade, then settles on one layer", async () => {
    const items: Record<string, ItemDetail> = { a: item("a", "00QY9j"), b: item("b", "00L-|1") };
    const gateway = fakeSessionGateway({
      itemDetail: vi.fn((id: string) => Promise.resolve(items[id])),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (id: string) => (
      <QueryClientProvider client={client}>
        <PlayerServicesProvider services={{ engine: new FakePlayerEngine() }}>
          <SessionProvider createGateway={() => gateway}>
            <SignIn gateway={gateway} />
            <ItemDetailView itemId={id} />
          </SessionProvider>
        </PlayerServicesProvider>
      </QueryClientProvider>
    );
    const view = render(tree("a"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
    });
    await screen.findByRole("heading", { name: "Title a" });
    const root = screen.getByTestId("ambient-backdrop");
    const accentA = root.style.getPropertyValue("--art-accent");
    const keys = () => screen.getAllByTestId("ambient-layer").map((l) => l.dataset.key);
    await waitFor(() => expect(keys()).toEqual(["a/bd-a"]));

    view.rerender(tree("b"));
    await screen.findByRole("heading", { name: "Title b" });
    expect(screen.getByTestId("ambient-backdrop")).toBe(root);
    await waitFor(() => expect(keys()).toEqual(["a/bd-a", "b/bd-b"]));
    expect(root.style.getPropertyValue("--art-accent")).not.toBe(accentA);
    await waitFor(() => expect(keys()).toEqual(["b/bd-b"]), { timeout: 3000 });
  });
});
