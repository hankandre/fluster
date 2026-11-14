import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { EpisodeCard, ItemDetail, MediaCard, SeriesNextUp } from "../../domain/catalog";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { SeriesView } from "../browse";
import { HomeView } from "./index";

vi.mock("./blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

// P3-27: the Home hero and the series page offer the same episode, in the same words, for every state.

const detail: ItemDetail = {
  id: "s1",
  type: "Series",
  title: "Harbor Lights",
  year: 2022,
  genres: ["Drama", "Mystery"],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};

const seriesCard: MediaCard = { id: "s1", title: "Harbor Lights", aspectRatio: 2 / 3, kind: "Series" };
const episode = (id: string, episodeNumber: number): EpisodeCard => ({
  id,
  kind: "Episode",
  title: `Episode ${episodeNumber}`,
  seasonNumber: 1,
  episodeNumber,
  aspectRatio: 1.78,
});

interface Case {
  name: string;
  nextUp: SeriesNextUp | undefined;
  label: string;
  href: string;
  ring: boolean;
}

const cases: Case[] = [
  {
    name: "an episode in progress",
    nextUp: { id: "ep-2", title: "Second", seasonId: "se1", seasonNumber: 1, episodeNumber: 2, resumePositionTicks: 13_200_000_000, progress: 0.49 },
    label: "Resume S1 · E2",
    href: "#/next/play/ep-2?start=13200000000",
    ring: true,
  },
  {
    name: "a series not started (Next Up offers the first episode)",
    nextUp: { id: "ep-1", title: "First", seasonId: "se1", seasonNumber: 1, episodeNumber: 1 },
    label: "Play S1 · E1",
    href: "#/next/play/ep-1",
    ring: false,
  },
  {
    name: "a series fully watched (no Next Up)",
    nextUp: undefined,
    label: "Play S1 · E1",
    href: "#/next/play/ep-1",
    ring: false,
  },
];

function gatewayFor(nextUp: SeriesNextUp | undefined): SessionGateway {
  return fakeSessionGateway({
    userViews: vi.fn().mockResolvedValue([{ id: "lib-1", name: "Shows", collectionType: "tvshows" }]),
    resumeItems: vi.fn().mockResolvedValue([]),
    nextUp: vi.fn().mockResolvedValue([]),
    latestInLibrary: vi.fn().mockResolvedValue([seriesCard]),
    itemDetail: vi.fn().mockResolvedValue(detail),
    seriesNextUp: vi.fn().mockResolvedValue(nextUp),
    seasons: vi.fn().mockResolvedValue([
      { id: "sp", name: "Specials", indexNumber: 0 },
      { id: "se1", name: "Season 1", indexNumber: 1 },
      { id: "se2", name: "Season 2", indexNumber: 2 },
    ]),
    episodes: vi.fn().mockImplementation((_series: string, seasonId: string) =>
      Promise.resolve(seasonId === "se1" ? [episode("ep-1", 1), episode("ep-2", 2)] : [])),
    imageUrl: vi.fn(() => "https://media.test/image.webp"),
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderView(gateway: SessionGateway, view: "home" | "series") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider createGateway={() => gateway}>
        <SignIn gateway={gateway} />
        {view === "home" ? <HomeView /> : <SeriesView seriesId="s1" />}
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

beforeEach(() => {
  window.location.hash = "#/next/home";
});

afterEach(cleanup);

describe.each(cases)("$name", ({ nextUp, label, href, ring }) => {
  it("offers the same episode on the Home hero and on the series page", async () => {
    await renderView(gatewayFor(nextUp), "home");
    const hero = await screen.findByRole("region", { name: "Harbor Lights" });
    const heroPrimary = await within(hero).findByRole("link", { name: label });
    const token = label.replace(/^(Play|Resume) /, "");
    const heroHref = heroPrimary.getAttribute("href");
    const heroRing = heroPrimary.querySelector(".ui-progress-ring") !== null;
    expect(hero.textContent).toContain(`${token} · 2022 · Drama · Mystery`);
    cleanup();

    window.location.hash = "#/next/series/s1";
    await renderView(gatewayFor(nextUp), "series");
    const seriesPrimary = await screen.findByRole("link", { name: label });

    expect(heroHref).toBe(href);
    expect(seriesPrimary).toHaveAttribute("href", href);
    expect(heroRing).toBe(ring);
    expect(seriesPrimary.querySelector(".ui-progress-ring") !== null).toBe(ring);
  });
});
