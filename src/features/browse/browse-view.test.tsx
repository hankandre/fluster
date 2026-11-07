import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { BrowseCard, BrowsePage } from "../../domain/catalog";
import { BrowseView, CollectionView, SeriesView } from "./index";

vi.mock("../home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

function card(id: string, title: string, kind: BrowseCard["kind"] = "Movie"): BrowseCard {
  return { id, title, kind, aspectRatio: 2 / 3 };
}

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return {
    serverUrl: "https://jellyfin.test",
    connect: vi.fn(),
    login: vi.fn(),
    quickConnectEnabled: vi.fn(),
    initiateQuickConnect: vi.fn(),
    pollQuickConnect: vi.fn(),
    authenticateWithQuickConnect: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    userViews: vi.fn().mockResolvedValue([
      { id: "lib-1", name: "Movies", collectionType: "movies" },
      { id: "lib-2", name: "Sets", collectionType: "boxsets" },
    ]),
    resumeItems: vi.fn(),
    nextUp: vi.fn(),
    latestInLibrary: vi.fn(),
    libraryItems: vi.fn().mockResolvedValue({ cards: [card("m1", "Arrival")], hasMore: false } satisfies BrowsePage),
    searchHints: vi.fn(),
    searchItems: vi.fn(),
    seasons: vi.fn().mockResolvedValue([{ id: "se1", name: "Season 1" }, { id: "se2", name: "Season 2" }]),
    episodes: vi.fn().mockImplementation((_series: string, seasonId: string) =>
      Promise.resolve([{ id: `${seasonId}-e1`, title: `Opener of ${seasonId}`, subtitle: "Episode 1", aspectRatio: 1.78, overview: "Plot." }])),
    imageUrl: vi.fn(() => "https://media.test/img.webp"),
    authorizationHeader: vi.fn(() => 'MediaBrowser Token="test"'),
    ...overrides,
  };
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
  it("links to each library grid", async () => {
    await renderView(fakeGateway(), <BrowseView />);
    expect(await screen.findByRole("link", { name: "Movies" })).toHaveAttribute("href", "#/next/browse/lib-1");
    expect(screen.getByRole("link", { name: "Sets" })).toHaveAttribute("href", "#/next/browse/lib-2");
  });
});

describe("library grid", () => {
  it("renders cards, linking only series and collections", async () => {
    const gateway = fakeGateway({
      libraryItems: vi.fn().mockResolvedValue({
        cards: [card("m1", "Arrival"), card("s1", "Great Show", "Series"), card("b1", "Saga", "BoxSet")],
        hasMore: false,
      }),
    });
    await renderView(gateway, <BrowseView libraryId="lib-1" />);
    expect(await screen.findByRole("article", { name: "Arrival" })).toBeInTheDocument();
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
    await screen.findByRole("article", { name: "Arrival" });
    expect(vi.mocked(gateway.libraryItems).mock.calls[0]?.[1].itemTypes).toEqual(["BoxSet"]);
  });

  it("loads the next page at the right startIndex", async () => {
    const libraryItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "First")], hasMore: true })
      .mockResolvedValueOnce({ cards: [card("m2", "Second")], hasMore: false });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("article", { name: "First" });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("article", { name: "Second" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "First" })).toBeInTheDocument();
    expect(libraryItems.mock.calls[1]?.[1].startIndex).toBe(60);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("restarts from the first page when sort or filter changes", async () => {
    const libraryItems = vi.fn().mockResolvedValue({ cards: [card("m1", "First")], hasMore: true });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    await screen.findByRole("article", { name: "First" });
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
    expect(await screen.findByRole("article", { name: "Recovered" })).toBeInTheDocument();
  });
});

describe("series", () => {
  it("shows the first season's episodes and loads another when switched", async () => {
    const gateway = fakeGateway();
    await renderView(gateway, <SeriesView seriesId="series-1" />);
    expect(await screen.findByRole("article", { name: "Opener of se1, Episode 1" })).toBeInTheDocument();
    expect(gateway.episodes).toHaveBeenCalledWith("series-1", "se1", expect.any(AbortSignal));

    fireEvent.click(screen.getByRole("button", { name: "Season 2" }));

    expect(await screen.findByRole("article", { name: "Opener of se2, Episode 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Season 2" })).toHaveAttribute("aria-pressed", "true");
    expect(gateway.episodes).toHaveBeenCalledWith("series-1", "se2", expect.any(AbortSignal));
  });
});

describe("series defaults", () => {
  it("opens the first regular season, not Specials", async () => {
    const gateway = fakeGateway({
      seasons: vi.fn().mockResolvedValue([
        { id: "sp", name: "Specials", indexNumber: 0 },
        { id: "se1", name: "Season 1", indexNumber: 1 },
      ]),
    });
    await renderView(gateway, <SeriesView seriesId="series-1" />);
    expect(await screen.findByRole("article", { name: "Opener of se1, Episode 1" })).toBeInTheDocument();
    expect(gateway.episodes).not.toHaveBeenCalledWith("series-1", "sp", expect.anything());
  });

  it("falls back to Specials when it is the only season", async () => {
    const gateway = fakeGateway({ seasons: vi.fn().mockResolvedValue([{ id: "sp", name: "Specials", indexNumber: 0 }]) });
    await renderView(gateway, <SeriesView seriesId="series-1" />);
    expect(await screen.findByRole("article", { name: "Opener of sp, Episode 1" })).toBeInTheDocument();
  });
});

describe("focus and announcements", () => {
  it("focuses the page heading and announces newly loaded items", async () => {
    const libraryItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "First")], hasMore: true })
      .mockResolvedValueOnce({ cards: [card("m2", "Second"), card("m3", "Third")], hasMore: false });
    await renderView(fakeGateway({ libraryItems }), <BrowseView libraryId="lib-1" />);
    expect(screen.getByRole("heading", { level: 1, name: "Browse" })).toHaveFocus();
    await screen.findByRole("article", { name: "First" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("2 more items loaded")).toBeInTheDocument();
  });
});

describe("collection", () => {
  it("browses the collection's items with the collection as parent", async () => {
    const gateway = fakeGateway();
    await renderView(gateway, <CollectionView collectionId="box-1" />);
    expect(await screen.findByRole("article", { name: "Arrival" })).toBeInTheDocument();
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
