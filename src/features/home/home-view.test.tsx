import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { MediaCard } from "../../domain/catalog";
import { HomeView } from "./index";

vi.mock("./blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

function card(id: string, title: string, overrides: Partial<MediaCard> = {}): MediaCard {
  return { id, title, aspectRatio: 2 / 3, ...overrides };
}

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return {
    connect: vi.fn(),
    login: vi.fn(),
    quickConnectEnabled: vi.fn(),
    initiateQuickConnect: vi.fn(),
    pollQuickConnect: vi.fn(),
    authenticateWithQuickConnect: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    userViews: vi.fn().mockResolvedValue([{ id: "lib-1", name: "Movies", collectionType: "movies" }]),
    resumeItems: vi.fn().mockResolvedValue([card("r1", "Resume me", { progress: 0.4 })]),
    nextUp: vi.fn().mockResolvedValue([card("n1", "Up next")]),
    latestInLibrary: vi.fn().mockResolvedValue([card("l1", "Fresh movie")]),
    libraryItems: vi.fn(),
    seasons: vi.fn(),
    episodes: vi.fn(),
    imageUrl: vi.fn((itemId: string, type: string, tag: string) => `https://media.test/${itemId}/${type}/${tag}.webp`),
    ...overrides,
  };
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

  it("renders Continue Watching, Next Up, and a Latest row per library", async () => {
    await renderHome(fakeGateway({
      userViews: vi.fn().mockResolvedValue([{ id: "lib-1", name: "Movies" }, { id: "lib-2", name: "Shows" }]),
    }));
    expect(await screen.findByRole("heading", { name: "Continue Watching" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Next Up" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Latest in Movies" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Latest in Shows" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Resume me, 40% watched" })).toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { name: "Next Up" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Continue Watching" })).not.toBeInTheDocument();
  });

  it("shows a per-row error that retries without disturbing other rows", async () => {
    const nextUp = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([card("n1", "Up next")]);
    const gateway = fakeGateway({ nextUp });
    await renderHome(gateway);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load Next Up.");
    expect(await screen.findByRole("article", { name: "Resume me, 40% watched" })).toBeInTheDocument();

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

  it("renders cards as non-interactive list items", async () => {
    await renderHome(fakeGateway());
    const item = await screen.findByRole("article", { name: "Resume me, 40% watched" });
    expect(item).not.toHaveAttribute("tabindex");
    expect(within(item).queryByRole("button")).not.toBeInTheDocument();
    expect(item.closest("li")).not.toBeNull();
  });
});
