import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { BrowseCard, BrowsePage, ItemDetail } from "../../domain/catalog";
import { BrowseView } from "./index";
import { CollectionView } from "./collection-view";
import { ItemNotFoundError } from "../../domain/catalog";
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
    itemDetail: vi.fn().mockResolvedValue({ id: "box-1", type: "BoxSet", title: "Harbor Collection" } as ItemDetail),
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
  window.location.hash = "#/next/browse/lib-1";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

class FakeObserver {
  static instances: FakeObserver[] = [];
  constructor(readonly callback: (entries: { isIntersecting: boolean }[]) => void) {
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
}

function intersect() {
  act(() => FakeObserver.instances.forEach((observer) => observer.callback([{ isIntersecting: true }])));
}

async function chooseSort(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Sort / }));
  fireEvent.click(await screen.findByRole("option", { name }));
}

const pagedItems = () => vi.fn()
  .mockResolvedValueOnce({ cards: [card("m1", "First")], hasMore: true, totalCount: 3 })
  .mockResolvedValueOnce({ cards: [card("m2", "Second"), card("m3", "Third")], hasMore: false });

describe("library page", () => {
  it("titles the page with the library name and focuses it", async () => {
    await renderView(fakeGateway(), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "Arrival" });
    expect(screen.getByRole("heading", { level: 1, name: "Movies" })).toHaveFocus();
    expect(screen.getByRole("region", { name: "Movies" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Sort and filter" })).toBeInTheDocument();
  });

  it("shows placeholders while the libraries load", async () => {
    const gateway = fakeGateway({ userViews: vi.fn(() => new Promise<never>(() => {})) });
    await renderView(gateway, <BrowseView libraryId="lib-1" />);
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(document.querySelector("section[aria-busy='true']")).not.toBeNull();
    expect(screen.getAllByTestId("card-skeleton")).toHaveLength(12);
  });

  it("offers a retry when the libraries fail to load", async () => {
    const userViews = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([{ id: "lib-1", name: "Movies", collectionType: "movies" }]);
    await renderView(fakeGateway({ userViews }), <BrowseView libraryId="lib-1" />);
    expect(await screen.findByText("Couldn't load your libraries.")).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Movies" })).toBeInTheDocument();
  });

  it("says so when the library is not in the list", async () => {
    await renderView(fakeGateway(), <BrowseView libraryId="nope" />);
    expect(await screen.findByRole("heading", { level: 1, name: "This library isn't available" })).toHaveFocus();
    expect(screen.getByText("It may have been removed, or this account can't see it.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "#/next/home");
  });

  it("shows the item count from the first page", async () => {
    const libraryItems = vi.fn().mockResolvedValue({ cards: [card("m1", "Arrival")], hasMore: false, totalCount: 3 });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    expect(await screen.findByText("3 items")).toBeInTheDocument();
  });

  it("says '1 item' for one and shows no count when the server sent none", async () => {
    const one = vi.fn().mockResolvedValue({ cards: [card("m1", "Arrival")], hasMore: false, totalCount: 1 });
    await renderView(fakeGateway({ libraryItems: one }), <BrowseView libraryId="lib-1" />);
    expect(await screen.findByText("1 item")).toBeInTheDocument();
    cleanup();
    await renderView(fakeGateway(), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "Arrival" });
    expect(screen.queryByText(/\d+ items?$/)).not.toBeInTheDocument();
  });

  it("remounts and resets the sort when the library changes", async () => {
    const libraryItems = vi.fn().mockResolvedValue({ cards: [card("m1", "Arrival")], hasMore: false });
    const gateway = fakeGateway({ libraryItems });
    function Switch() {
      const [id, setId] = React.useState("lib-1");
      return <><button onClick={() => setId("lib-2")}>switch</button><BrowseView libraryId={id} /></>;
    }
    await renderView(gateway, <Switch />);
    await screen.findByRole("link", { name: "Arrival" });
    await chooseSort("Newest added first");
    expect(await screen.findByRole("button", { name: "Sort Newest added first" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Sets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort Name A to Z" })).toBeInTheDocument();
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
    const libraryItems = pagedItems();
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "First" });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("link", { name: "Second" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "First" })).toBeInTheDocument();
    expect(libraryItems.mock.calls[1]?.[1].startIndex).toBe(60);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("loads the next page by itself when the end nears the viewport", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    FakeObserver.instances = [];
    const libraryItems = pagedItems();
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "First" });
    intersect();
    expect(await screen.findByRole("link", { name: "Second" })).toBeInTheDocument();
    expect(libraryItems.mock.calls[1]?.[1].startIndex).toBe(60);
    expect(await screen.findByText("2 more items loaded")).toBeInTheDocument();
  });

  it("restarts from the first page when sort or filter changes", async () => {
    const libraryItems = vi.fn().mockResolvedValue({ cards: [card("m1", "First")], hasMore: true });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "First" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(libraryItems).toHaveBeenCalledTimes(2));

    await chooseSort("Newest added first");
    await waitFor(() => expect(libraryItems).toHaveBeenCalledTimes(3));
    expect(libraryItems.mock.calls[2]?.[1]).toMatchObject({ startIndex: 0, sortBy: "DateCreated", sortOrder: "Descending" });

    fireEvent.click(within(screen.getByRole("group", { name: "Filters" })).getByRole("button", { name: "Unwatched" }));
    await waitFor(() => expect(libraryItems).toHaveBeenCalledTimes(4));
    expect(libraryItems.mock.calls[3]?.[1]).toMatchObject({ startIndex: 0, sortBy: "DateCreated", sortOrder: "Descending", filters: ["IsUnplayed"] });
  });

  it("offers a retry when the first page fails", async () => {
    const libraryItems = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ cards: [card("m1", "Recovered")], hasMore: false });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    expect(await screen.findByText("Couldn't load Movies.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Recovered" })).toBeInTheDocument();
  });

  it("keeps the cards and offers a retry when a later page fails", async () => {
    const libraryItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "First")], hasMore: true })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ cards: [card("m2", "Second")], hasMore: false });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "First" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Couldn't load more items.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "First" })).toBeInTheDocument();
    const retry = screen.getAllByRole("button", { name: "Retry" });
    fireEvent.click(retry[0]);
    expect(await screen.findByRole("link", { name: "Second" })).toBeInTheDocument();
  });

  it("does not load again by itself after a failed page", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    FakeObserver.instances = [];
    const libraryItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "First")], hasMore: true })
      .mockRejectedValue(new Error("boom"));
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "First" });
    intersect();
    await screen.findByText("Couldn't load more items.");
    intersect();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(libraryItems).toHaveBeenCalledTimes(2);
  });

  it("explains an empty library", async () => {
    const libraryItems = vi.fn().mockResolvedValue({ cards: [], hasMore: false, totalCount: 0 });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    expect(await screen.findByRole("heading", { name: "Nothing in this library yet" })).toBeInTheDocument();
    expect(screen.getByText("Add media in Jellyfin, then come back.")).toBeInTheDocument();
  });

  it("clears filters from the filtered-empty state and focuses Unwatched", async () => {
    const libraryItems = vi.fn().mockImplementation((_id: string, query: { filters: string[] }) =>
      Promise.resolve(query.filters.length > 0
        ? { cards: [], hasMore: false, totalCount: 0 }
        : { cards: [card("m1", "Arrival")], hasMore: false }));
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("link", { name: "Arrival" });
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByRole("heading", { name: "Nothing matches these filters" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("button", { name: "Unwatched" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Favorites" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("link", { name: "Arrival" })).toBeInTheDocument();
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

  it("reaches the toolbar with Up from the first row and Load more with Down from the last", async () => {
    await renderView(fakeGateway({ libraryItems: pagedItems() }), <BrowseView libraryId="lib-1" />);
    const first = await screen.findByRole("link", { name: "First" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Load more" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(within(screen.getByRole("toolbar")).getAllByRole("button").some((button) => button === document.activeElement)).toBe(true);
  });
});

describe("focus and announcements", () => {
  it("announces newly loaded items and moves focus to the first new card", async () => {
    await renderView(fakeGateway({ libraryItems: pagedItems() }), <BrowseView libraryId="lib-1" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    await screen.findByRole("link", { name: "First" });
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    fireEvent.click(button);
    expect(await screen.findByText("2 more items loaded")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("link", { name: "Second" })).toHaveFocus());
  });
});

describe("detail prefetch", () => {
  it("prefetches a Movie's detail after a 300 ms rest, and not a Series'", async () => {
    const itemDetail = vi.fn().mockResolvedValue({ id: "m1", type: "Movie", title: "Arrival" });
    const libraryItems = vi.fn().mockResolvedValue({ cards: [card("m1", "Arrival"), card("s1", "Show", "Series")], hasMore: false });
    await renderView(fakeGateway({ libraryItems, itemDetail }), <BrowseView libraryId="lib-1" />);
    const movie = await screen.findByRole("link", { name: "Arrival" });
    act(() => movie.focus());
    expect(itemDetail).not.toHaveBeenCalled();
    await waitFor(() => expect(itemDetail).toHaveBeenCalledWith("m1", expect.anything()), { timeout: 1_000 });

    itemDetail.mockClear();
    act(() => screen.getByRole("link", { name: "Show" }).focus());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(itemDetail).not.toHaveBeenCalled();
  });
});

describe("collection", () => {
  it("titles the page with the collection's name and browses its items", async () => {
    const gateway = fakeGateway();
    await renderView(gateway, <CollectionView collectionId="box-1" />);
    expect(await screen.findByRole("link", { name: "Arrival" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Harbor Collection" })).toBeInTheDocument();
    expect(vi.mocked(gateway.libraryItems).mock.calls[0]?.[0]).toBe("box-1");
  });

  it("shows the item-gone notice and no grid when the collection is missing", async () => {
    const gateway = fakeGateway({ itemDetail: vi.fn().mockRejectedValue(new ItemNotFoundError()) });
    await renderView(gateway, <CollectionView collectionId="box-1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "This item is no longer on the server" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("keeps the grid when only the name fails to load", async () => {
    const gateway = fakeGateway({ itemDetail: vi.fn().mockRejectedValue(new Error("boom")) });
    await renderView(gateway, <CollectionView collectionId="box-1" />);
    expect(await screen.findByText("Couldn't load this collection's name.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Collection" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Arrival" })).toBeInTheDocument();
  });
});

describe("signed out", () => {
  it("redirects to sign-in", () => {
    const gateway = fakeGateway();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider createGateway={() => gateway}><BrowseView libraryId="lib-1" /></SessionProvider>
      </QueryClientProvider>,
    );
    expect(window.location.hash).toBe("#/next/sign-in");
  });
});
