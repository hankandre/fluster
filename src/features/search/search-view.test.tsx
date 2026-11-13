import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { SearchCard, SearchHint, SearchPage } from "../../domain/catalog";
import { SearchView } from "./index";
import { fakeSessionGateway } from "../../test/fake-session-gateway";

vi.mock("../home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

const HINTS: SearchHint[] = [
  { id: "m1", name: "Arrival", kind: "Movie", year: 2016, image: { itemId: "m1", type: "Primary", tag: "t-m1" } },
  { id: "s1", name: "Arrow", kind: "Series", year: 2012 },
];

const EPISODE_HINT: SearchHint = {
  id: "e1", name: "The Keeper's Log", kind: "Episode", seriesName: "Harbor Lights", seasonNumber: 1, episodeNumber: 2,
};

function card(id: string, title: string, kind: SearchCard["kind"]): SearchCard {
  return { id, title, kind, aspectRatio: 2 / 3 };
}

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return fakeSessionGateway({
    serverUrl: "https://jellyfin.test",
    origin: "https://jellyfin.test",
    searchHints: vi.fn().mockResolvedValue(HINTS),
    searchItems: vi.fn().mockResolvedValue({ cards: [], hasMore: false } satisfies SearchPage),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderView(gateway: SessionGateway, term?: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider createGateway={() => gateway}>
        <SignIn gateway={gateway} />
        <SearchView term={term} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

const input = () => screen.getByRole("combobox", { name: "Search movies, series, and episodes" });

async function type(value: string) {
  await act(async () => {
    fireEvent.change(input(), { target: { value } });
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  // Let the query that the debounce started settle and render.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.location.hash = "#/next/search";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("type-ahead", () => {
  it("waits for a pause and at least two characters", async () => {
    const gateway = fakeGateway();
    await renderView(gateway);
    await type("a");
    await advance(500);
    expect(gateway.searchHints).not.toHaveBeenCalled();

    await type("ar");
    await advance(200);
    expect(gateway.searchHints).not.toHaveBeenCalled();
    await type("arr");
    await advance(200);
    expect(gateway.searchHints).not.toHaveBeenCalled();
    await advance(100);
    expect(gateway.searchHints).toHaveBeenCalledTimes(1);
    expect(vi.mocked(gateway.searchHints).mock.calls[0]?.[0]).toBe("arr");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("aborts the request for a stale term", async () => {
    const signals: AbortSignal[] = [];
    const gateway = fakeGateway({
      searchHints: vi.fn((_term: string, signal?: AbortSignal) => {
        if (signal) signals.push(signal);
        return new Promise<SearchHint[]>(() => {});
      }),
    });
    await renderView(gateway);
    await type("arr");
    await advance(250);
    await type("arro");
    await advance(250);
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("moves through hints with the arrow keys and wraps", async () => {
    await renderView(fakeGateway());
    await type("ar");
    await advance(250);
    expect(input()).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    expect(input()).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0]?.id);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("Up from the field with the list closed leaves for the row above", async () => {
    await renderView(fakeGateway());
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a series hint and a movie hint directly", async () => {
    await renderView(fakeGateway());
    await type("ar");
    await advance(250);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(window.location.hash).toBe("#/next/series/s1");

    window.location.hash = "#/next/search";
    await type("arr");
    await advance(250);
    fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
    expect(window.location.hash).toBe("#/next/item/m1");
  });

  it("opens a movie hint with the keyboard", async () => {
    await renderView(fakeGateway());
    await type("arr");
    await advance(250);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(window.location.hash).toBe("#/next/item/m1");
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens an episode hint's detail", async () => {
    await renderView(fakeGateway({ searchHints: vi.fn().mockResolvedValue([EPISODE_HINT]) }));
    await type("keeper");
    await advance(250);
    fireEvent.click(screen.getByRole("option"));
    expect(window.location.hash).toBe("#/next/item/e1");
  });

  it("keeps the combobox semantics and shows art, title, year, and type", async () => {
    const gateway = fakeGateway({ imageUrl: vi.fn((id: string) => `https://jellyfin.test/Items/${id}/Images/Primary`) });
    await renderView(gateway);
    await type("ar");
    await advance(250);
    const listbox = screen.getByRole("listbox", { name: "Suggestions" });
    expect(input()).toHaveAttribute("role", "combobox");
    expect(input()).toHaveAttribute("aria-autocomplete", "list");
    expect(input()).toHaveAttribute("aria-controls", listbox.id);
    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("2 suggestions available");
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.getAttribute("aria-label"))).toEqual(["Arrival, 2016, Movie", "Arrow, 2012, Show"]);
    expect(options[0]?.querySelector("img")).toHaveAttribute("src", "https://jellyfin.test/Items/m1/Images/Primary");
    expect(options[0]).toHaveTextContent("2016 · Movie");
    expect(options[1]?.querySelector("img")).toBeNull();
    expect(gateway.imageUrl).toHaveBeenCalledWith("m1", "Primary", "t-m1", 120);
  });

  it("shows an episode's series and number in its suggestion", async () => {
    await renderView(fakeGateway({ searchHints: vi.fn().mockResolvedValue([EPISODE_HINT]) }));
    await type("keeper");
    await advance(250);
    expect(screen.getByRole("option")).toHaveAccessibleName("The Keeper's Log, Harbor Lights, S1 · E2, Episode");
    expect(screen.getByRole("option")).toHaveTextContent("Harbor Lights · S1 · E2 · Episode");
  });

  it("submits the typed term on Enter when no hint is highlighted", async () => {
    await renderView(fakeGateway());
    await type("  star trek ");
    await advance(250);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(window.location.hash).toBe("#/next/search/star%20trek");
  });
});

describe("route term", () => {
  it("does not request hints for the initial term until the input is edited", async () => {
    const gateway = fakeGateway();
    await renderView(gateway, "arrival");
    await advance(500);
    expect(gateway.searchHints).not.toHaveBeenCalled();
    await type("arrivals");
    await advance(250);
    expect(gateway.searchHints).toHaveBeenCalledTimes(1);
  });

  it("treats a whitespace-only term as the empty search page", async () => {
    const gateway = fakeGateway();
    await renderView(gateway, "   ");
    await advance(0);
    expect(gateway.searchItems).not.toHaveBeenCalled();
    expect(input()).toHaveValue("");
  });

  it("trims the term it searches for", async () => {
    const gateway = fakeGateway();
    await renderView(gateway, " ar ");
    await advance(0);
    expect(gateway.searchItems).toHaveBeenCalledWith("ar", expect.anything(), expect.any(AbortSignal));
  });
});

describe("results", () => {
  it("groups results by type and links each result", async () => {
    const gateway = fakeGateway({
      searchItems: vi.fn().mockResolvedValue({
        cards: [card("m1", "Arrival", "Movie"), card("s1", "Arrow", "Series"), card("e1", "Pilot", "Episode")],
        hasMore: false,
      } satisfies SearchPage),
    });
    await renderView(gateway, "ar");
    await advance(0);
    expect(screen.getByRole("heading", { name: "Movies" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shows" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Episodes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Arrow" })).toHaveAttribute("href", "#/next/series/s1");
    expect(screen.getByRole("link", { name: "Arrival" })).toHaveAttribute("href", "#/next/item/m1");
    expect(screen.getByRole("link", { name: "Pilot" })).toHaveAttribute("href", "#/next/item/e1");
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("3 results");
    expect(gateway.searchItems).toHaveBeenCalledWith("ar", { startIndex: 0, limit: 40 }, expect.any(AbortSignal));
  });

  it("shows Movies and Shows as poster cards and Episodes as thumb cards", async () => {
    const gateway = fakeGateway({
      searchItems: vi.fn().mockResolvedValue({
        cards: [card("m1", "Arrival", "Movie"), card("s1", "Arrow", "Series"), card("e1", "Pilot", "Episode")],
        hasMore: false,
      } satisfies SearchPage),
    });
    await renderView(gateway, "ar");
    await advance(0);
    expect(screen.getByRole("link", { name: "Arrival" })).toHaveAttribute("data-variant", "poster");
    expect(screen.getByRole("link", { name: "Arrow" })).toHaveAttribute("data-variant", "poster");
    expect(screen.getByRole("link", { name: "Pilot" })).toHaveAttribute("data-variant", "thumb");
  });

  it("moves through each result group with the arrow keys", async () => {
    const gateway = fakeGateway({
      searchItems: vi.fn().mockResolvedValue({
        cards: [card("m1", "Arrival", "Movie"), card("m2", "Armageddon", "Movie"), card("s1", "Arrow", "Series")],
        hasMore: false,
      } satisfies SearchPage),
    });
    await renderView(gateway, "ar");
    await advance(0);
    const arrival = screen.getByRole("link", { name: "Arrival" });
    arrival.focus();
    fireEvent.keyDown(arrival, { key: "ArrowRight" });
    expect(screen.getByRole("link", { name: "Armageddon" })).toHaveFocus();
    // Each group is its own Tab stop.
    expect(screen.getByRole("link", { name: "Arrow" })).toHaveAttribute("tabindex", "0");
    // Down crosses to the Shows row.
    fireEvent.keyDown(screen.getByRole("link", { name: "Armageddon" }), { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Arrow" })).toHaveFocus();
  });

  it("loads more pages", async () => {
    const searchItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "Arrival", "Movie")], hasMore: true } satisfies SearchPage)
      .mockResolvedValueOnce({ cards: [card("m2", "Arrow Movie", "Movie")], hasMore: false } satisfies SearchPage);
    await renderView(fakeGateway({ searchItems }), "ar");
    await advance(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    });
    await advance(0);
    expect(searchItems.mock.calls[1]?.[1]).toEqual({ startIndex: 40, limit: 40 });
    expect(screen.getByRole("link", { name: "Arrow Movie" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    await renderView(fakeGateway(), "zzz");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("heading", { name: 'No matches for "zzz"' })).toBeInTheDocument();
    expect(screen.getByText("Check the spelling, or try part of the title.")).toBeInTheDocument();
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("No results");
  });

  it("shows an error and retries", async () => {
    const searchItems = vi.fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ cards: [card("m1", "Arrival", "Movie")], hasMore: false } satisfies SearchPage);
    await renderView(fakeGateway({ searchItems }), "ar");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load search results.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await advance(0);
    expect(screen.getByRole("link", { name: "Arrival" })).toBeInTheDocument();
  });
});

describe("the page", () => {
  it("focuses the field on open, with and without a term", async () => {
    await renderView(fakeGateway());
    expect(input()).toHaveFocus();
    cleanup();
    await renderView(fakeGateway(), "arrival");
    expect(input()).toHaveFocus();
  });

  it("shows the start state without a term", async () => {
    await renderView(fakeGateway());
    expect(screen.getByRole("heading", { name: "Search your libraries" })).toBeInTheDocument();
    expect(screen.getByText("Movies, shows, and episodes.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Search" })).toBeInTheDocument();
  });

  it("clears the text on Escape when the list is closed and keeps the route", async () => {
    await renderView(fakeGateway(), "arrival");
    window.location.hash = "#/next/search/arrival";
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveValue("");
    expect(window.location.hash).toBe("#/next/search/arrival");
  });

  it("closes the list on the first Escape and clears on the second", async () => {
    await renderView(fakeGateway());
    await type("arr");
    await advance(250);
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).toHaveValue("arr");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveValue("");
  });

  it("clears and refocuses with the clear button", async () => {
    await renderView(fakeGateway());
    await type("arr");
    screen.getByRole("button", { name: "Clear search" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("moves from the field into the results with Down, and back with Up", async () => {
    const gateway = fakeGateway({
      searchItems: vi.fn().mockResolvedValue({ cards: [card("m1", "Arrival", "Movie")], hasMore: false } satisfies SearchPage),
    });
    await renderView(gateway, "ar");
    await advance(0);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Arrival" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("link", { name: "Arrival" }), { key: "ArrowUp" });
    expect(input()).toHaveFocus();
  });
});

describe("result states", () => {
  it("shows a skeleton row and the Searching status while pending", async () => {
    const gateway = fakeGateway({ searchItems: vi.fn(() => new Promise<SearchPage>(() => {})) });
    await renderView(gateway, "ar");
    await advance(150);
    expect(screen.getAllByTestId("card-skeleton").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("Searching");
  });

  it("shows no old row-error copy and no transport message", async () => {
    const searchItems = vi.fn().mockRejectedValue(new Error("down"));
    await renderView(fakeGateway({ searchItems }), "ar");
    await advance(0);
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
    expect(screen.queryByText(/down/)).not.toBeInTheDocument();
  });

  it("keeps the rows and offers Retry when the next page fails", async () => {
    const searchItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "Arrival", "Movie")], hasMore: true } satisfies SearchPage)
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ cards: [card("m2", "Arrow Movie", "Movie")], hasMore: false } satisfies SearchPage);
    await renderView(fakeGateway({ searchItems }), "ar");
    await advance(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    });
    await advance(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load more results.");
    expect(screen.getByRole("link", { name: "Arrival" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await advance(0);
    expect(screen.getByRole("link", { name: "Arrow Movie" })).toBeInTheDocument();
  });

  it("focuses Retry when the next page fails after Load more", async () => {
    const searchItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "Arrival", "Movie")], hasMore: true } satisfies SearchPage)
      .mockRejectedValueOnce(new Error("down"));
    await renderView(fakeGateway({ searchItems }), "ar");
    await advance(0);
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    await act(async () => {
      fireEvent.click(button);
    });
    await advance(0);
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus();
  });

  it("focuses the first new card after Load more", async () => {
    const searchItems = vi.fn()
      .mockResolvedValueOnce({ cards: [card("m1", "Arrival", "Movie")], hasMore: true } satisfies SearchPage)
      .mockResolvedValueOnce({ cards: [card("m2", "Arrow Movie", "Movie")], hasMore: false } satisfies SearchPage);
    await renderView(fakeGateway({ searchItems }), "ar");
    await advance(0);
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    await act(async () => {
      fireEvent.click(button);
    });
    await advance(0);
    expect(screen.getByRole("link", { name: "Arrow Movie" })).toHaveFocus();
  });

  it("reaches Load more with Down from the last row", async () => {
    const gateway = fakeGateway({
      searchItems: vi.fn().mockResolvedValue({ cards: [card("m1", "Arrival", "Movie")], hasMore: true } satisfies SearchPage),
    });
    await renderView(gateway, "ar");
    await advance(0);
    fireEvent.keyDown(screen.getByRole("link", { name: "Arrival" }), { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Load more" })).toHaveFocus();
  });
});

describe("detail prefetch", () => {
  it("prefetches a Movie or Episode after a 300 ms dwell, and a Series never", async () => {
    const itemDetail = vi.fn().mockResolvedValue({});
    const gateway = fakeGateway({
      itemDetail,
      searchItems: vi.fn().mockResolvedValue({
        cards: [card("m1", "Arrival", "Movie"), card("s1", "Arrow", "Series")],
        hasMore: false,
      } satisfies SearchPage),
    });
    await renderView(gateway, "ar");
    await advance(0);
    await act(async () => {
      screen.getByRole("link", { name: "Arrow" }).focus();
    });
    await advance(400);
    expect(itemDetail).not.toHaveBeenCalled();
    await act(async () => {
      screen.getByRole("link", { name: "Arrival" }).focus();
    });
    await advance(200);
    expect(itemDetail).not.toHaveBeenCalled();
    await advance(150);
    expect(itemDetail).toHaveBeenCalledWith("m1", expect.anything());
  });
});
