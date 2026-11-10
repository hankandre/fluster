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
  { id: "m1", name: "Arrival", kind: "Movie", year: 2016 },
  { id: "s1", name: "Arrow", kind: "Series", year: 2012 },
];

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

  it("opens a series hint and searches for a movie hint", async () => {
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
    expect(window.location.hash).toBe("#/next/search/Arrival");
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
    expect(screen.getByRole("heading", { name: "Series" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Episodes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Arrow" })).toHaveAttribute("href", "#/next/series/s1");
    expect(screen.getByRole("link", { name: "Arrival" })).toHaveAttribute("href", "#/next/item/m1");
    expect(screen.getByRole("link", { name: "Pilot" })).toHaveAttribute("href", "#/next/item/e1");
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("3 results");
    expect(gateway.searchItems).toHaveBeenCalledWith("ar", { startIndex: 0, limit: 40 }, expect.any(AbortSignal));
  });

  it("shows Movies and Series as poster cards and Episodes as thumb cards", async () => {
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
    expect(screen.getByText('No results for "zzz".')).toBeInTheDocument();
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
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load search results.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await advance(0);
    expect(screen.getByRole("link", { name: "Arrival" })).toBeInTheDocument();
  });
});
