import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail, MediaCard } from "../../domain/catalog";
import { FakeRealtime } from "../../test/fake-realtime";
import { HomeView, refreshHomeRows } from "./index";
import { fakeSessionGateway } from "../../test/fake-session-gateway";

vi.mock("./blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

function card(id: string, title: string, overrides: Partial<MediaCard> = {}): MediaCard {
  return { id, title, aspectRatio: 2 / 3, ...overrides };
}

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return fakeSessionGateway({
    userViews: vi.fn().mockResolvedValue([{ id: "lib-1", name: "Movies", collectionType: "movies" }]),
    resumeItems: vi.fn().mockResolvedValue([card("r1", "Resume me", { progress: 0.4, remainingTicks: 22_800_000_000 })]),
    nextUp: vi.fn().mockResolvedValue([card("n1", "Up next")]),
    latestInLibrary: vi.fn().mockResolvedValue([card("l1", "Fresh movie")]),
    itemDetail: vi.fn().mockRejectedValue(new Error("x")),
    imageUrl: vi.fn((itemId: string, type: string, tag: string) => `https://media.test/${itemId}/${type}/${tag}.webp`),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderHome(gateway: SessionGateway) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider createGateway={() => gateway}>
        <SignIn gateway={gateway} />
        <HomeView />
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  window.location.hash = "#/next/home";
});

afterEach(cleanup);

describe("HomeView", () => {
  it("redirects to sign-in when signed out", () => {
    const gateway = fakeGateway();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider createGateway={() => gateway}><HomeView /></SessionProvider>
      </QueryClientProvider>,
    );
    expect(window.location.hash).toBe("#/next/sign-in");
    expect(gateway.resumeItems).not.toHaveBeenCalled();
  });

  it("has no Sign out button or developer links; the nav and Settings own them", async () => {
    await renderHome(fakeGateway());
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to features" })).not.toBeInTheDocument();
  });

  it("renders Continue watching, Next up, and a Latest row per library", async () => {
    await renderHome(fakeGateway({
      userViews: vi.fn().mockResolvedValue([{ id: "lib-1", name: "Movies" }, { id: "lib-2", name: "Shows" }]),
    }));
    expect(await screen.findByRole("heading", { name: "Continue watching" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Next up" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Latest in Movies" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Latest in Shows" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Resume me, 38 minutes left" })).toBeInTheDocument();
  });

  it("shows thumb cards in Continue Watching and Next Up and poster cards in Latest", async () => {
    await renderHome(fakeGateway());
    expect(await screen.findByRole("article", { name: "Resume me, 38 minutes left" })).toHaveAttribute("data-variant", "thumb");
    expect(screen.getByRole("article", { name: "Up next" })).toHaveAttribute("data-variant", "thumb");
    expect(await screen.findByRole("article", { name: "Fresh movie" })).toHaveAttribute("data-variant", "poster");
  });

  it("shows skeletons of the row's variant while rows load", async () => {
    const never = new Promise<MediaCard[]>(() => undefined);
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockReturnValue(never),
      nextUp: vi.fn().mockReturnValue(never),
      userViews: vi.fn().mockReturnValue(new Promise(() => undefined)),
    }));
    const variants = screen.getAllByTestId("card-skeleton").map((node) => node.getAttribute("data-variant"));
    expect(variants).toContain("thumb");
    expect(variants).toContain("poster");
  });

  it("starts every row query before any of them resolves", async () => {
    const resume = deferred<MediaCard[]>();
    const nextUp = deferred<MediaCard[]>();
    const views = deferred<{ id: string; name: string }[]>();
    const latest = deferred<MediaCard[]>();
    const gateway = fakeGateway({
      resumeItems: vi.fn().mockReturnValue(resume.promise),
      nextUp: vi.fn().mockReturnValue(nextUp.promise),
      userViews: vi.fn().mockReturnValue(views.promise),
      latestInLibrary: vi.fn().mockReturnValue(latest.promise),
    });
    await renderHome(gateway);
    expect(gateway.resumeItems).toHaveBeenCalledTimes(1);
    expect(gateway.nextUp).toHaveBeenCalledTimes(1);
    expect(gateway.userViews).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("card-skeleton").length).toBeGreaterThan(0);

    await act(async () => views.resolve([{ id: "a", name: "A" }, { id: "b", name: "B" }]));
    await waitFor(() => expect(gateway.latestInLibrary).toHaveBeenCalledTimes(2));
    expect(gateway.latestInLibrary).toHaveBeenCalledWith("a", expect.any(AbortSignal));
    expect(gateway.latestInLibrary).toHaveBeenCalledWith("b", expect.any(AbortSignal));
  });

  it("hides rows that have no items", async () => {
    await renderHome(fakeGateway({ resumeItems: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByRole("heading", { name: "Next up" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Continue watching" })).not.toBeInTheDocument();
  });

  it("shows a per-row error that retries without disturbing other rows", async () => {
    const nextUp = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([card("n1", "Up next")]);
    const gateway = fakeGateway({ nextUp });
    await renderHome(gateway);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load Next up.");
    expect(await screen.findByRole("article", { name: "Resume me, 38 minutes left" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    });
    expect(await screen.findByRole("article", { name: "Up next" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(gateway.resumeItems).toHaveBeenCalledTimes(1);
  });

  it("shows the blurhash until the image loads, with a neutral block when there is no hash", async () => {
    const image = { itemId: "r1", type: "Primary" as const, tag: "t1", blurHash: "HASH" };
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([card("r1", "With hash", { image })]),
      nextUp: vi.fn().mockResolvedValue([
        card("n1", "No hash", { image: { itemId: "n1", type: "Primary", tag: "t2" } }),
      ]),
      userViews: vi.fn().mockResolvedValue([]),
    }));
    const hashed = (await screen.findByRole("article", { name: "With hash" })).querySelector("[data-testid=card-image]")!;
    expect(hashed).toHaveAttribute("data-state", "loading");
    expect(hashed).toHaveAttribute("data-placeholder", "blurhash");
    expect(hashed).toHaveStyle({ backgroundImage: "url(data:image/png;base64,HASH)" });
    const img = hashed.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://media.test/r1/Primary/t1.webp");

    fireEvent.load(img);
    expect(hashed).toHaveAttribute("data-state", "loaded");

    const plain = screen.getByRole("article", { name: "No hash" }).querySelector("[data-testid=card-image]")!;
    expect(plain).toHaveAttribute("data-placeholder", "neutral");
  });

  it("links Continue watching and Next up cards to play and Latest cards to details by kind", async () => {
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([card("m1", "A movie", { kind: "Movie" })]),
      nextUp: vi.fn().mockResolvedValue([card("e1", "An episode", { kind: "Episode" })]),
      latestInLibrary: vi.fn().mockResolvedValue([card("s1", "A series", { kind: "Series" })]),
    }));
    expect(await screen.findByRole("link", { name: "A movie" })).toHaveAttribute("href", "#/next/play/m1");
    expect(await screen.findByRole("link", { name: "An episode" })).toHaveAttribute("href", "#/next/play/e1");
    expect(await screen.findByRole("link", { name: "A series" })).toHaveAttribute("href", "#/next/series/s1");
  });

  it("makes each row one Tab stop and moves between its cards with the arrow keys", async () => {
    await renderHome(fakeGateway({
      latestInLibrary: vi.fn().mockResolvedValue([
        card("m1", "First", { kind: "Movie" }),
        card("m2", "Second", { kind: "Movie" }),
      ]),
    }));
    const first = await screen.findByRole("link", { name: "First" });
    const second = screen.getByRole("link", { name: "Second" });
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(first).toHaveFocus();
  });

  it("renders cards of unknown kind as non-interactive list items", async () => {
    await renderHome(fakeGateway());
    const item = await screen.findByRole("article", { name: "Resume me, 38 minutes left" });
    expect(item).not.toHaveAttribute("tabindex");
    expect(within(item).queryByRole("button")).not.toBeInTheDocument();
    expect(item.closest("li")).not.toBeNull();
  });

  it("refetches watched state when another client changes it", async () => {
    const gateway = fakeGateway({
      resumeItems: vi.fn()
        .mockResolvedValueOnce([card("r1", "Resume me", { progress: 0.4, remainingTicks: 22_800_000_000 })])
        .mockResolvedValue([]),
    });
    const realtime = new FakeRealtime();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider
          createGateway={() => gateway}
          realtime={realtime}
          onServerDataChanged={() => void refreshHomeRows(queryClient)}
        >
          <SignIn gateway={gateway} />
          <HomeView />
        </SessionProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
    });
    await screen.findByRole("article", { name: "Resume me, 38 minutes left" });
    expect(realtime.connect).toHaveBeenCalledWith("https://media.test", 'MediaBrowser Token="test-token"');

    await act(async () => {
      realtime.emit({ kind: "user-data-changed", itemIds: ["r1"] });
    });

    await waitFor(() => expect(screen.queryByRole("article", { name: "Resume me, 38 minutes left" })).not.toBeInTheDocument());
    expect(gateway.resumeItems).toHaveBeenCalledTimes(2);
    expect(gateway.nextUp).toHaveBeenCalledTimes(2);
    expect(gateway.latestInLibrary).toHaveBeenCalledTimes(2);
    expect(gateway.userViews).toHaveBeenCalledTimes(1);
  });

  it("has a hidden Home heading and no hero when nothing can be one", async () => {
    await renderHome(fakeGateway());
    await screen.findByRole("article", { name: "Resume me, 38 minutes left" });
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Resume me" })).not.toBeInTheDocument();
  });

  it("plays a Continue watching card on one link and opens details with i", async () => {
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([card("r1", "Resume me", { kind: "Movie", resumePositionTicks: 600 })]),
    }));
    const link = await screen.findByRole("link", { name: "Resume me" });
    expect(link).toHaveAttribute("href", "#/next/play/r1?start=600");
    expect(link).toHaveAttribute("aria-keyshortcuts", "i");
    expect(link).toHaveAccessibleDescription("Enter plays. Press i for details.");
    fireEvent.keyDown(link, { key: "i" });
    expect(window.location.hash).toBe("#/next/item/r1");
  });

  it("plays a Next up card from the start and opens its details with i", async () => {
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([]),
      nextUp: vi.fn().mockResolvedValue([card("n1", "Up next", { kind: "Episode" })]),
      latestInLibrary: vi.fn().mockResolvedValue([]),
    }));
    const nextUpRegion = await screen.findByRole("region", { name: "Next up" });
    const link = within(nextUpRegion).getByRole("link", { name: "Up next" });
    expect(link).toHaveAttribute("href", "#/next/play/n1");
    fireEvent.keyDown(link, { key: "i" });
    expect(window.location.hash).toBe("#/next/item/n1");
  });

  it("shows the Continue watching item as the hero, still in its row", async () => {
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([card("r1", "Resume me", { kind: "Movie", resumePositionTicks: 41 * 600_000_000 })]),
    }));
    const hero = await screen.findByRole("region", { name: "Resume me" });
    expect(within(hero).getByRole("link", { name: "Resume from 41:00" })).toHaveAttribute("href", "#/next/play/r1?start=24600000000");
    expect(within(hero).getByRole("link", { name: "More info" })).toHaveAttribute("href", "#/next/item/r1");
    expect(screen.getAllByRole("link", { name: "Resume me" })).toHaveLength(1);
  });

  it("falls to a Next up hero when Resume is empty, and a Latest hero when both are empty", async () => {
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([]),
      nextUp: vi.fn().mockResolvedValue([card("n1", "Up next", { kind: "Episode", seasonNumber: 1, episodeNumber: 3 })]),
    }));
    const hero = await screen.findByRole("region", { name: "Up next" });
    expect(within(hero).getByRole("link", { name: "Play S1 · E3" })).toBeInTheDocument();
    cleanup();

    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([]),
      nextUp: vi.fn().mockResolvedValue([]),
      latestInLibrary: vi.fn().mockResolvedValue([card("l1", "Fresh movie", { kind: "Movie" })]),
    }));
    const latest = await screen.findByRole("region", { name: "Fresh movie" });
    expect(within(latest).getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/l1");
  });

  it("waits for Resume before choosing a hero, even when Next up resolved", async () => {
    const resume = deferred<MediaCard[]>();
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockReturnValue(resume.promise),
      nextUp: vi.fn().mockResolvedValue([card("n1", "Up next", { kind: "Episode" })]),
    }));
    await screen.findByRole("region", { name: "Next up" });
    expect(screen.queryByRole("region", { name: "Up next" })).not.toBeInTheDocument();
    expect(document.querySelector(".hero[aria-busy=true]")).not.toBeNull();
    await act(async () => resume.resolve([card("r1", "Resume me", { kind: "Movie" })]));
    expect(await screen.findByRole("region", { name: "Resume me" })).toBeInTheDocument();
  });

  it("resolves a series hero to its first episode", async () => {
    const seasons = vi.fn().mockResolvedValue([
      { id: "sp", name: "Specials", indexNumber: 0 },
      { id: "se1", name: "Season 1", indexNumber: 1 },
    ]);
    const episodes = vi.fn().mockResolvedValue([card("ep1", "Pilot", { seasonNumber: 1, episodeNumber: 1 })]);
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([]),
      nextUp: vi.fn().mockResolvedValue([]),
      latestInLibrary: vi.fn().mockResolvedValue([card("s1", "A series", { kind: "Series" })]),
      seasons,
      episodes,
    }));
    const hero = await screen.findByRole("region", { name: "A series" });
    const play = await within(hero).findByRole("link", { name: "Play S1 · E1" });
    expect(play).toHaveAttribute("href", "#/next/play/ep1");
    expect(seasons).toHaveBeenCalledWith("s1", expect.any(AbortSignal));
    expect(episodes).toHaveBeenCalledWith("s1", "se1", expect.any(AbortSignal));
    expect(within(hero).getByRole("link", { name: "More info" })).toHaveAttribute("href", "#/next/series/s1");
  });

  it("shows detail facts and the overview in the hero", async () => {
    const detail: ItemDetail = {
      id: "m1",
      type: "Movie",
      title: "Arrival",
      year: 2016,
      runTimeTicks: 116 * 600_000_000,
      overview: "A linguist decodes an alien language.",
      genres: [],
      cast: [],
      userData: { played: false, favorite: false, resumePositionTicks: 0 },
      versions: [],
    };
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([card("m1", "Arrival", { kind: "Movie" })]),
      itemDetail: vi.fn().mockResolvedValue(detail),
    }));
    const hero = await screen.findByRole("region", { name: "Arrival" });
    expect(await within(hero).findByText("2016 · 1 h 56 min")).toBeInTheDocument();
    expect(within(hero).getByText("A linguist decodes an alien language.")).toBeInTheDocument();
  });

  it("moves the ambient art to a focused card after 300 ms", async () => {
    const art = (id: string) => ({ itemId: id, type: "Backdrop" as const, tag: `bd-${id}` });
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([]),
      nextUp: vi.fn().mockResolvedValue([]),
      latestInLibrary: vi.fn().mockResolvedValue([
        card("m1", "First", { kind: "Movie", backdrop: art("m1") }),
        card("m2", "Second", { kind: "Movie", backdrop: art("m2") }),
      ]),
    }));
    const second = await screen.findByRole("link", { name: "Second" });
    vi.useFakeTimers();
    try {
      act(() => second.focus());
      act(() => { vi.advanceTimersByTime(299); });
      const layers = () => screen.getAllByTestId("ambient-layer");
      expect(layers().at(-1)?.getAttribute("data-key")).toBe("m1/bd-m1");
      act(() => { vi.advanceTimersByTime(1); });
      expect(layers().at(-1)?.getAttribute("data-key")).toBe("m2/bd-m2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the empty state with the server name and a link to settings", async () => {
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([]),
      nextUp: vi.fn().mockResolvedValue([]),
      latestInLibrary: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockResolvedValue({ name: "Hankflix" }),
    }));
    expect(await screen.findByRole("heading", { name: "Nothing to watch yet" })).toBeInTheDocument();
    expect(await screen.findByText(/Your libraries on Hankflix don't have any movies or shows/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute("href", "#/next/settings");
  });

  it("falls back to the host in the empty state when the server probe fails", async () => {
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([]),
      nextUp: vi.fn().mockResolvedValue([]),
      userViews: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockRejectedValue(new Error("down")),
    }));
    expect(await screen.findByText(/Your libraries on media\.test don't have/)).toBeInTheDocument();
  });

  it("shows no empty state when a row failed or has items", async () => {
    await renderHome(fakeGateway({
      resumeItems: vi.fn().mockResolvedValue([]),
      nextUp: vi.fn().mockRejectedValue(new Error("boom")),
      latestInLibrary: vi.fn().mockResolvedValue([]),
    }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: "Nothing to watch yet" })).not.toBeInTheDocument();
    cleanup();

    await renderHome(fakeGateway());
    await screen.findByRole("article", { name: "Resume me, 38 minutes left" });
    expect(screen.queryByRole("heading", { name: "Nothing to watch yet" })).not.toBeInTheDocument();
  });
});
