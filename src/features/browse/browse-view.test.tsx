import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { BrowseCard, BrowsePage } from "../../domain/catalog";
import { BrowseView, CollectionView } from "./index";
import { fakeSessionGateway } from "../../test/fake-session-gateway";

vi.mock("../home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

function card(id: string, title: string, kind: BrowseCard["kind"] = "Movie"): BrowseCard {
  return { id, title, kind, aspectRatio: 2 / 3 };
}

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return fakeSessionGateway({
    serverUrl: "https://jellyfin.test",
    origin: "https://jellyfin.test",
    userViews: vi.fn().mockResolvedValue([
      { id: "lib-1", name: "Movies", collectionType: "movies" },
      { id: "lib-2", name: "Sets", collectionType: "boxsets" },
    ]),
    libraryItems: vi.fn().mockResolvedValue({ cards: [card("m1", "Arrival")], hasMore: false } satisfies BrowsePage),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderView(gateway: SessionGateway, view: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider createGateway={() => gateway}>
        <SignIn gateway={gateway} />
        {view}
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

beforeEach(() => {
  window.location.hash = "#/next/browse";
});

afterEach(cleanup);

describe("library list", () => {
  it("has no Sign out button and no link to the feature index", async () => {
    await renderView(fakeGateway(), <BrowseView />);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to features" })).not.toBeInTheDocument();
  });

  it("links to each library grid", async () => {
    await renderView(fakeGateway(), <BrowseView />);
    expect(await screen.findByRole("link", { name: "Movies" })).toHaveAttribute("href", "#/next/browse/lib-1");
    expect(screen.getByRole("link", { name: "Sets" })).toHaveAttribute("href", "#/next/browse/lib-2");
  });
});

describe("library cards", () => {
  it("renders one library card per library in a single roving grid", async () => {
    await renderView(fakeGateway(), <BrowseView />);
    const movies = await screen.findByRole("link", { name: "Movies" });
    expect(movies).toHaveAttribute("data-variant", "library");
    const stops = screen.getAllByRole("link").filter((link) => link.closest(".media-grid") && link.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    movies.focus();
    fireEvent.keyDown(movies, { key: "ArrowRight" });
    expect(screen.getByRole("link", { name: "Sets" })).toHaveFocus();
  });
});

describe("card variants", () => {
  it("uses poster cards in the library grid", async () => {
    await renderView(fakeGateway(), <BrowseView libraryId="lib-1" />);
    expect(await screen.findByRole("link", { name: "Arrival" })).toHaveAttribute("data-variant", "poster");
  });
});

describe("library grid", () => {
  it("renders cards as links to the item, series, or collection", async () => {
    const gateway = fakeGateway({
      libraryItems: vi.fn().mockResolvedValue({
        cards: [card("m1", "Arrival"), card("s1", "Great Show", "Series"), card("b1", "Saga", "BoxSet")],
        hasMore: false,
      }),
    });
    await renderView(gateway, <BrowseView libraryId="lib-1" />);
    expect(await screen.findByRole("link", { name: "Arrival" })).toHaveAttribute("href", "#/next/item/m1");
    expect(screen.getByRole("link", { name: "Great Show" })).toHaveAttribute("href", "#/next/series/s1");
    expect(screen.getByRole("link", { name: "Saga" })).toHaveAttribute("href", "#/next/collection/b1");
    expect(gateway.libraryItems).toHaveBeenCalledWith(
      "lib-1",
      { itemTypes: ["Movie", "Series"], startIndex: 0, limit: 60, sortBy: "SortName", sortOrder: "Ascending", filters: [] },
      expect.any(AbortSignal),
    );
  });

  it("browses a boxset library as collections", async () => {
    const gateway = fakeGateway();
    await renderView(gateway, <BrowseView libraryId="lib-2" />);
    await screen.findByRole("link", { name: "Arrival" });
    expect(vi.mocked(gateway.libraryItems).mock.calls[0]?.[1].itemTypes).toEqual(["BoxSet"]);
  });

  it("loads the next page at the right startIndex", async () => {
    const libraryItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "First")], hasMore: true })
      .mockResolvedValueOnce({ cards: [card("m2", "Second")], hasMore: false });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "First" });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("link", { name: "Second" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "First" })).toBeInTheDocument();
    expect(libraryItems.mock.calls[1]?.[1].startIndex).toBe(60);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("restarts from the first page when sort or filter changes", async () => {
    const libraryItems = vi.fn().mockResolvedValue({ cards: [card("m1", "First")], hasMore: true });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "First" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(libraryItems).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "DateCreated" } });
    await waitFor(() => expect(libraryItems).toHaveBeenCalledTimes(3));
    expect(libraryItems.mock.calls[2]?.[1]).toMatchObject({ startIndex: 0, sortBy: "DateCreated" });

    fireEvent.click(within(screen.getByRole("group", { name: "Filter" })).getByLabelText("Unwatched"));
    await waitFor(() => expect(libraryItems).toHaveBeenCalledTimes(4));
    expect(libraryItems.mock.calls[3]?.[1]).toMatchObject({ startIndex: 0, sortBy: "DateCreated", filters: ["IsUnplayed"] });
  });

  it("offers a retry when the first page fails", async () => {
    const libraryItems = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ cards: [card("m1", "Recovered")], hasMore: false });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Recovered" })).toBeInTheDocument();
  });
});

describe("keyboard", () => {
  it("moves through the library grid with the arrow keys", async () => {
    const gateway = fakeGateway({
      libraryItems: vi.fn().mockResolvedValue({
        cards: [card("m1", "Arrival"), card("m2", "Blade Runner"), card("m3", "Contact")],
        hasMore: false,
      } satisfies BrowsePage),
    });
    await renderView(gateway, <BrowseView libraryId="lib-1" />);
    const first = await screen.findByRole("link", { name: "Arrival" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("link", { name: "Blade Runner" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(screen.getByRole("link", { name: "Contact" })).toHaveFocus();
    expect(screen.getAllByRole("link").filter((link) => link.closest(".media-grid") && link.getAttribute("tabindex") === "0"))
      .toEqual([screen.getByRole("link", { name: "Contact" })]);
  });
});

describe("focus and announcements", () => {
  it("focuses the page heading and announces newly loaded items", async () => {
    const libraryItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "First")], hasMore: true })
      .mockResolvedValueOnce({ cards: [card("m2", "Second"), card("m3", "Third")], hasMore: false });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    expect(screen.getByRole("heading", { level: 1, name: "Browse" })).toHaveFocus();
    await screen.findByRole("link", { name: "First" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("2 more items loaded")).toBeInTheDocument();
  });
});

describe("collection", () => {
  it("browses the collection's items with the collection as parent", async () => {
    const gateway = fakeGateway();
    await renderView(gateway, <CollectionView collectionId="box-1" />);
    expect(await screen.findByRole("link", { name: "Arrival" })).toBeInTheDocument();
    expect(vi.mocked(gateway.libraryItems).mock.calls[0]?.[0]).toBe("box-1");
  });
});

describe("signed out", () => {
  it("redirects to sign-in", () => {
    const gateway = fakeGateway();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider createGateway={() => gateway}><BrowseView /></SessionProvider>
      </QueryClientProvider>,
    );
    expect(window.location.hash).toBe("#/next/sign-in");
  });
});
