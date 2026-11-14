import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EpisodeCard, ItemDetail } from "../../domain/catalog";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { EpisodeStrip } from "./episode-strip";

vi.mock("../home/blurhash", () => ({ blurhashToDataUrl: () => undefined }));

afterEach(cleanup);

const cards = [
  { id: "e1", title: "Landfall", aspectRatio: 16 / 9, kind: "Episode" },
  { id: "e2", title: "The Keeper's Log", aspectRatio: 16 / 9, kind: "Episode" },
  { id: "e3", title: "Fog Signal", aspectRatio: 16 / 9, kind: "Episode" },
] as EpisodeCard[];

function episode(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: "e2",
    type: "Episode",
    title: "The Keeper's Log",
    seriesId: "s1",
    seasonId: "se1",
    seasonName: "Season 1",
    seasonNumber: 1,
    genres: [],
    cast: [],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions: [],
    ...overrides,
  };
}

function renderStrip(item: ItemDetail, episodes = vi.fn().mockResolvedValue(cards)) {
  const gateway = fakeSessionGateway({ episodes });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EpisodeStrip gateway={gateway} item={item} />
    </QueryClientProvider>,
  );
  return episodes;
}

describe("EpisodeStrip start", () => {
  const six = ["e1", "e2", "e3", "e4", "e5", "e6"].map((id) => ({ id, title: id, aspectRatio: 16 / 9, kind: "Episode" }) as EpisodeCard);
  async function tabStop(current: string): Promise<string | null> {
    renderStrip(episode({ id: current }), vi.fn().mockResolvedValue(six));
    const links = await screen.findAllByRole("link");
    const stop = links.find((link) => link.getAttribute("tabindex") === "0");
    return stop?.getAttribute("href") ?? null;
  }

  it("holds the Tab stop on the episode after the current one", async () => {
    expect(await tabStop("e5")).toBe("#/next/item/e6");
  });

  it("holds it on the previous episode when the current is last", async () => {
    expect(await tabStop("e6")).toBe("#/next/item/e5");
  });

  it("holds it on the second episode when the current is first", async () => {
    expect(await tabStop("e1")).toBe("#/next/item/e2");
  });
});

describe("EpisodeStrip", () => {
  it("asks for the season's episodes and lists the others", async () => {
    const episodes = renderStrip(episode());
    await screen.findAllByRole("link");
    const strip = screen.getByRole("region", { name: "More from Season 1" });
    expect(episodes).toHaveBeenCalledWith("s1", "se1", expect.any(AbortSignal));
    expect(within(strip).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#/next/item/e1", "#/next/item/e3"]);
    expect(within(strip).queryByRole("link", { name: /Keeper/ })).toBeNull();
  });

  it("names the strip from the season number, then generically", async () => {
    renderStrip(episode({ seasonName: undefined }));
    expect(await screen.findByRole("region", { name: "More from Season 1" })).toBeInTheDocument();
    cleanup();
    renderStrip(episode({ seasonName: undefined, seasonNumber: undefined }));
    expect(await screen.findByRole("region", { name: "More from this season" })).toBeInTheDocument();
  });

  it("is hidden when the season has no other episode", async () => {
    const episodes = renderStrip(episode(), vi.fn().mockResolvedValue([cards[1]]));
    await vi.waitFor(() => expect(episodes).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  });

  it("makes no request for a movie", () => {
    const movie = renderStrip(episode({ type: "Movie" }));
    expect(movie).not.toHaveBeenCalled();
    expect(screen.queryByRole("region")).toBeNull();
  });

  describe("when the server omits SeasonId", () => {
    const seasons = [
      { id: "se0", name: "Specials", indexNumber: 0 },
      { id: "se1", name: "Season 1", indexNumber: 1 },
    ];

    function renderWithSeasons(item: ItemDetail, list = seasons) {
      const episodes = vi.fn().mockResolvedValue(cards);
      const seasonsFn = vi.fn().mockResolvedValue(list);
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <EpisodeStrip gateway={fakeSessionGateway({ episodes, seasons: seasonsFn })} item={item} />
        </QueryClientProvider>,
      );
      return { episodes, seasonsFn };
    }

    it("finds the season by number among the series' seasons", async () => {
      const { episodes, seasonsFn } = renderWithSeasons(episode({ seasonId: undefined }));
      await screen.findAllByRole("link");
      expect(seasonsFn).toHaveBeenCalledWith("s1", expect.any(AbortSignal));
      expect(episodes).toHaveBeenCalledWith("s1", "se1", expect.any(AbortSignal));
    });

    it("falls back to the season name, then hides the strip when none matches", async () => {
      const { episodes } = renderWithSeasons(episode({ seasonId: undefined, seasonNumber: undefined }));
      await vi.waitFor(() => expect(episodes).toHaveBeenCalledWith("s1", "se1", expect.any(AbortSignal)));
      cleanup();
      const none = renderWithSeasons(episode({ seasonId: undefined, seasonNumber: 9, seasonName: "Season 9" }));
      await vi.waitFor(() => expect(none.seasonsFn).toHaveBeenCalled());
      await vi.waitFor(() => expect(screen.queryByRole("region")).toBeNull());
      expect(none.episodes).not.toHaveBeenCalled();
    });
  });

  it("shows an error with Retry that asks again", async () => {
    const episodes = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(cards);
    renderStrip(episode(), episodes);
    expect(await screen.findByText("Couldn't load More from Season 1.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /Landfall/ })).toBeInTheDocument();
    expect(episodes).toHaveBeenCalledTimes(2);
  });
});
