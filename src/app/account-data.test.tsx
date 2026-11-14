import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowseCard, ItemDetail, MediaCard } from "../domain/catalog";
import { BrowseView, SeriesView } from "../features/browse";
import { ItemDetailView } from "../features/detail";
import { HomeView } from "../features/home";
import { SearchView } from "../features/search";
import { ToastProvider } from "../features/shared/ui";
import { resetFocusReturn } from "../features/shell/focus-return";
import { fakeSessionGateway } from "../test/fake-session-gateway";
import { resetAccountData } from "./account-data";
import { createQueryClient } from "./query-client";
import { SessionProvider, useSession, type SessionGateway } from "./session";

vi.mock("../features/home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

const card = (id: string, title: string): MediaCard => ({ id, title, aspectRatio: 2 / 3 });
const browseCard = (id: string, title: string): BrowseCard => ({ id, title, kind: "Movie", aspectRatio: 2 / 3 });
const detail = (id: string, title: string): ItemDetail => ({
  id, type: "Movie", title, genres: [], cast: [], userData: { played: false, favorite: false, resumePositionTicks: 0 }, versions: [],
});

// A gateway whose every title carries a prefix, so one account's data is easy to tell from another's.
function accountGateway(name: string, pending = false): SessionGateway {
  const settle = <T,>(value: T) => (pending ? new Promise<T>(() => undefined) : Promise.resolve(value));
  return fakeSessionGateway({
    serverUrl: `https://${name}.test`,
    origin: `https://${name}.test`,
    userViews: vi.fn(() => settle([{ id: "lib-1", name: `${name} Movies`, collectionType: "movies" }])),
    resumeItems: vi.fn(() => settle([card(`${name}-r1`, `${name} Resume`)])),
    nextUp: vi.fn(() => settle([])),
    latestInLibrary: vi.fn(() => settle([card(`${name}-l1`, `${name} Latest`)])),
    libraryItems: vi.fn(() => settle({ cards: [browseCard(`${name}-m1`, `${name} Film`)], hasMore: false })),
    itemDetail: vi.fn(() => settle(detail(`${name}-d1`, `${name} Detail`))),
    searchItems: vi.fn(() => settle({ cards: [{ ...card(`${name}-s1`, `${name} Hit`), kind: "Movie" as const }], hasMore: false })),
    searchHints: vi.fn(() => settle([])),
    seasons: vi.fn(() => settle([])),
    seriesNextUp: vi.fn(() => settle(undefined)),
    episodes: vi.fn(() => settle([])),
  });
}

function Controls({ gateways }: { gateways: Record<string, SessionGateway> }) {
  const session = useSession();
  return (
    <>
      {Object.entries(gateways).map(([name, gateway]) => (
        <button key={name} onClick={() => session.signIn(gateway)}>{`sign in ${name}`}</button>
      ))}
      <button onClick={() => void session.signOut()}>sign out</button>
    </>
  );
}

function mount(client: QueryClient, gateways: Record<string, SessionGateway>, view: ReactNode) {
  return render(
    <ToastProvider>
      <QueryClientProvider client={client}>
        <SessionProvider createGateway={() => Object.values(gateways)[0]} onAccountChanged={(next) => resetAccountData(client, next)}>
          <Controls gateways={gateways} />
          {view}
        </SessionProvider>
      </QueryClientProvider>
    </ToastProvider>,
  );
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

const cachedText = (client: QueryClient) => JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data ?? null));
const storageKeys = () => [Object.keys(localStorage), Object.keys(sessionStorage)];

beforeEach(() => {
  window.location.hash = "#/next/home";
});
afterEach(() => {
  cleanup();
  resetFocusReturn();
});

describe("kept screen data is per account", () => {
  const A = () => accountGateway("alpha");
  const B = () => accountGateway("beta");

  async function browseAs(client: QueryClient, gateways: Record<string, SessionGateway>) {
    mount(client, gateways, <><HomeView /><BrowseView libraryId="lib-1" /></>);
  }

  it("never shows the first account's data after a switch", async () => {
    const client = createQueryClient();
    const gateways = { alpha: A(), beta: B() };
    await browseAs(client, gateways);
    await click("sign in alpha");
    expect((await screen.findAllByText("alpha Film")).length).toBeGreaterThan(0);
    expect(cachedText(client)).toContain("alpha");
    await click("sign in beta");
    expect((await screen.findAllByText("beta Film")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/alpha (Film|Resume|Latest|Movies)/)).toHaveLength(0);
    expect(cachedText(client)).not.toContain("alpha");
    expect(new Set(client.getQueryCache().getAll().map((query) => query.queryKey[1])).size).toBe(1);
  });

  it("never shows the first account's data after a sign-out and a second sign-in", async () => {
    const client = createQueryClient();
    const gateways = { alpha: A(), beta: B() };
    await browseAs(client, gateways);
    await click("sign in alpha");
    await screen.findAllByText("alpha Film");
    await click("sign out");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    await click("sign in beta");
    expect((await screen.findAllByText("beta Film")).length).toBeGreaterThan(0);
    expect(cachedText(client)).not.toContain("alpha");
  });

  it("starts empty after a restart", async () => {
    const first = createQueryClient();
    const view = mount(first, { alpha: A() }, <BrowseView libraryId="lib-1" />);
    await click("sign in alpha");
    await screen.findAllByText("alpha Film");
    view.unmount();
    const second = createQueryClient();
    expect(second.getQueryCache().getAll()).toHaveLength(0);
    mount(second, { beta: B() }, <BrowseView libraryId="lib-1" />);
    await click("sign in beta");
    expect((await screen.findAllByText("beta Film")).length).toBeGreaterThan(0);
    expect(cachedText(second)).not.toContain("alpha");
  });

  it("writes nothing to storage and caches no token, URL, or session id", async () => {
    const before = storageKeys();
    const client = createQueryClient();
    mount(client, { alpha: A() }, <><HomeView /><BrowseView libraryId="lib-1" /></>);
    await click("sign in alpha");
    await screen.findAllByText("alpha Film");
    expect(storageKeys()).toEqual(before);
    expect(cachedText(client)).not.toMatch(/api_key|access_?token|Authorization|MediaBrowser|Token=|PlaySessionId|https?:\/\//i);
  });
});

describe("a return to a kept screen shows no skeleton", () => {
  // The first load answers; every later request never does, as when the server is slow on a return.
  function slowAfterFirst(): SessionGateway {
    const fast = accountGateway("alpha");
    const hang = accountGateway("alpha", true);
    const gateway = { ...fast } as SessionGateway;
    for (const key of Object.keys(fast) as (keyof SessionGateway)[]) {
      const first = fast[key];
      const later = hang[key];
      if (typeof first !== "function" || !vi.isMockFunction(first)) continue;
      let calls = 0;
      (gateway as unknown as Record<string, unknown>)[key] = vi.fn((...args: unknown[]) => {
        const call = (calls++ === 0 ? first : later) as unknown as (...a: unknown[]) => unknown;
        return call(...args);
      });
    }
    return gateway;
  }

  async function leaveAndReturn(view: ReactNode, title: string, staleFirst = true) {
    const client = createQueryClient();
    const gateway = slowAfterFirst();
    const first = mount(client, { alpha: gateway }, view);
    await click("sign in alpha");
    await screen.findAllByText(title);
    first.unmount();
    // Time passes while the user is elsewhere; a dropped query would be gone by now.
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Data older than staleTime refetches on return; the old data still shows meanwhile.
    if (staleFirst) await act(async () => { await client.invalidateQueries({ refetchType: "none" }); });
    mount(client, { alpha: gateway }, view);
    await click("sign in alpha");
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  }

  it("Home", async () => {
    window.location.hash = "#/next/home";
    await leaveAndReturn(<HomeView />, "alpha Resume");
  });

  it("a library", async () => {
    await leaveAndReturn(<BrowseView libraryId="lib-1" />, "alpha Film");
  });

  it("search results", async () => {
    await leaveAndReturn(<SearchView term="film" />, "alpha Hit");
  });

  it("an item's detail", async () => {
    await leaveAndReturn(<ItemDetailView itemId="d1" />, "alpha Detail");
  });

  it("a series", async () => {
    const client = createQueryClient();
    const gateway = slowAfterFirst();
    vi.mocked(gateway.itemDetail).mockClear();
    const first = mount(client, { alpha: gateway }, <SeriesView seriesId="series-1" />);
    await click("sign in alpha");
    await screen.findAllByText("alpha Detail");
    first.unmount();
    // Time passes while the user is elsewhere; a dropped query would be gone by now.
    await new Promise((resolve) => setTimeout(resolve, 20));
    mount(client, { alpha: gateway }, <SeriesView seriesId="series-1" />);
    await click("sign in alpha");
    expect(screen.getAllByText("alpha Detail").length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
