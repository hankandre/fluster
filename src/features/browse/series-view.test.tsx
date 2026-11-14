import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import { ItemNotFoundError, type EpisodeCard, type ItemDetail, type SeriesNextUp } from "../../domain/catalog";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { armReturn } from "../../test/arm-return";
import { resetFocusReturn } from "../shell/focus-return";
import { SeriesView } from "./index";

vi.mock("../home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

const TICKS_PER_MINUTE = 600_000_000;

function series(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: "series-1",
    type: "Series",
    title: "Harbor Lights",
    year: 2022,
    endYear: 2024,
    overview: "A lighthouse keeper finds a signal.",
    genres: ["Drama", "Mystery"],
    cast: [],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions: [],
    backdrop: { itemId: "series-1", type: "Backdrop", tag: "b1", blurHash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" },
    ...overrides,
  };
}

const NEXT: SeriesNextUp = {
  id: "ep-2",
  title: "The Keeper's Log",
  seasonId: "se1",
  seasonNumber: 1,
  episodeNumber: 2,
  resumePositionTicks: 13_200_000_000,
  progress: 0.49,
};

function episode(id: string, title: string, overrides: Partial<EpisodeCard> = {}): EpisodeCard {
  return { id, kind: "Episode", title, subtitle: "Episode 1", episodeNumber: 1, aspectRatio: 1.78, overview: "Plot.", ...overrides };
}

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return fakeSessionGateway({
    serverUrl: "https://jellyfin.test",
    origin: "https://jellyfin.test",
    itemDetail: vi.fn().mockResolvedValue(series()),
    seriesNextUp: vi.fn().mockResolvedValue(undefined),
    seasons: vi.fn().mockResolvedValue([{ id: "se1", name: "Season 1", indexNumber: 1 }, { id: "se2", name: "Season 2", indexNumber: 2 }]),
    episodes: vi.fn().mockImplementation((_series: string, seasonId: string) =>
      Promise.resolve([episode(`${seasonId}-e1`, `Opener of ${seasonId}`)])),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderSeries(gateway: SessionGateway, seriesId = "series-1", returning?: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider createGateway={() => gateway}>
        <SignIn gateway={gateway} />
        <SeriesView seriesId={seriesId} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  if (returning) {
    // The signed-out view redirects to sign-in, which clears returns; come back to the series route first.
    window.history.replaceState(null, "", `#/next/series/${seriesId}`);
    await armReturn(returning);
  }
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

const tab = (name: string) => screen.getByRole("tab", { name });

beforeEach(() => {
  window.location.hash = "#/next/series/series-1";
});

afterEach(() => {
  cleanup();
  resetFocusReturn();
});

describe("header", () => {
  it("focuses the series name as the one h1 and shows the facts and overview", async () => {
    await renderSeries(fakeGateway({ seriesNextUp: vi.fn().mockResolvedValue(NEXT) }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Harbor Lights" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(await screen.findByText("2022–2024 · 2 seasons · Drama · Mystery")).toBeInTheDocument();
    expect(screen.getByText("A lighthouse keeper finds a signal.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to libraries" })).not.toBeInTheDocument();
  });

  it("shows the series Logo as the h1 with the name as alt", async () => {
    const logo = { itemId: "series-1", type: "Logo" as const, tag: "l1" };
    const gateway = fakeGateway({
      itemDetail: vi.fn().mockResolvedValue(series({ logo })),
      imageUrl: vi.fn().mockReturnValue("https://jellyfin.test/logo.png"),
    });
    await renderSeries(gateway);
    const image = await screen.findByRole("img", { name: "Harbor Lights" });
    expect(image).toHaveAttribute("src", "https://jellyfin.test/logo.png");
    expect(screen.getByRole("heading", { level: 1 })).toContainElement(image);
  });
});

describe("primary action", () => {
  it("resumes the next episode with a ring and plays in one click", async () => {
    window.location.hash = "#/next/series/series-1";
    await renderSeries(fakeGateway({ seriesNextUp: vi.fn().mockResolvedValue(NEXT) }));
    const primary = await screen.findByRole("link", { name: "Resume S1 · E2" });
    expect(primary).toHaveAttribute("href", "#/next/play/ep-2?start=13200000000");
    expect(primary.querySelector(".ui-progress-ring")).not.toBeNull();
    fireEvent.click(primary);
    expect(window.location.hash).toBe("#/next/play/ep-2?start=13200000000");
  });

  it("plays an unstarted next episode from the start", async () => {
    const { resumePositionTicks: _position, progress: _progress, ...fresh } = NEXT;
    await renderSeries(fakeGateway({ seriesNextUp: vi.fn().mockResolvedValue({ ...fresh, id: "ep-3", episodeNumber: 3 }) }));
    const primary = await screen.findByRole("link", { name: "Play S1 · E3" });
    expect(primary).toHaveAttribute("href", "#/next/play/ep-3");
    expect(primary.querySelector(".ui-progress-ring")).toBeNull();
  });

  it("plays S1 · E1 from the first season when the server has no next episode, with one episodes call for it", async () => {
    const gateway = fakeGateway({
      episodes: vi.fn().mockResolvedValue([episode("ep-1", "Landfall", { seasonNumber: 1, episodeNumber: 1 })]),
    });
    await renderSeries(gateway);
    const primary = await screen.findByRole("link", { name: "Play S1 · E1" });
    expect(primary).toHaveAttribute("href", "#/next/play/ep-1");
    await screen.findByRole("link", { name: "Landfall, Episode 1" });
    expect(vi.mocked(gateway.episodes)).toHaveBeenCalledTimes(1);
  });

  it("falls back to the only season, even Specials", async () => {
    const gateway = fakeGateway({
      seasons: vi.fn().mockResolvedValue([{ id: "sp", name: "Specials", indexNumber: 0 }]),
      episodes: vi.fn().mockResolvedValue([episode("sp-1", "Bonus", { episodeNumber: 1 })]),
    });
    await renderSeries(gateway);
    expect(await screen.findByRole("link", { name: "Play S0 · E1" })).toHaveAttribute("href", "#/next/play/sp-1");
  });

  it("offers no primary and a Retry the arrow keys reach when Next Up fails, and opens the first regular season", async () => {
    const seriesNextUp = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(NEXT);
    const gateway = fakeGateway({ seriesNextUp });
    await renderSeries(gateway);
    expect(await screen.findByText("Couldn't load your next episode.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^(Play|Resume)/ })).not.toBeInTheDocument();
    await waitFor(() => expect(tab("Season 1")).toHaveAttribute("aria-selected", "true"));

    const retry = screen.getAllByRole("button", { name: "Retry" })[0];
    tab("Season 1").focus();
    fireEvent.keyDown(tab("Season 1"), { key: "ArrowUp" });
    expect(retry).toHaveFocus();
    fireEvent.keyDown(retry, { key: "ArrowDown" });
    expect(tab("Season 1")).toHaveFocus();

    fireEvent.click(retry);
    expect(await screen.findByRole("link", { name: "Resume S1 · E2" })).toBeInTheDocument();
  });

  it("shows a skeleton, not a link, while Next Up is pending", async () => {
    await renderSeries(fakeGateway({ seriesNextUp: vi.fn().mockReturnValue(new Promise(() => undefined)) }));
    await screen.findByRole("heading", { level: 1, name: "Harbor Lights" });
    expect(screen.queryByRole("link", { name: /^(Play|Resume)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});

describe("states", () => {
  it("shows a notice with Go home for a missing series", async () => {
    await renderSeries(fakeGateway({ itemDetail: vi.fn().mockRejectedValue(new ItemNotFoundError()) }));
    const heading = await screen.findByRole("heading", { level: 1, name: "This item is no longer on the server" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "#/next/home");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("offers Retry for a load error", async () => {
    const itemDetail = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(series());
    await renderSeries(fakeGateway({ itemDetail }));
    expect(await screen.findByRole("heading", { level: 1, name: "Couldn't load this item" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Harbor Lights" })).toBeInTheDocument();
  });

  it("has a single loading h1 while pending", async () => {
    await renderSeries(fakeGateway({ itemDetail: vi.fn().mockReturnValue(new Promise(() => undefined)) }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("says when the series has no episodes, and offers Retry when the seasons fail", async () => {
    await renderSeries(fakeGateway({ seasons: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText("This series has no episodes yet.")).toBeInTheDocument();
    cleanup();
    await renderSeries(fakeGateway({ seasons: vi.fn().mockRejectedValue(new Error("boom")) }));
    expect(await screen.findByText("Couldn't load the seasons.")).toBeInTheDocument();
  });

  it("shows an error with Retry when a season's episodes fail", async () => {
    await renderSeries(fakeGateway({ episodes: vi.fn().mockRejectedValue(new Error("boom")) }));
    expect(await screen.findByText("Couldn't load the episodes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute("data-roving-item");
  });
});

describe("seasons", () => {
  it("lists the tabs with Specials last and selects the next episode's season", async () => {
    const gateway = fakeGateway({
      seasons: vi.fn().mockResolvedValue([
        { id: "sp", name: "Specials", indexNumber: 0 },
        { id: "se1", name: "Season 1", indexNumber: 1 },
        { id: "se2", name: "Season 2", indexNumber: 2 },
      ]),
      seriesNextUp: vi.fn().mockResolvedValue({ ...NEXT, seasonId: "se2", seasonNumber: 2 }),
    });
    await renderSeries(gateway);
    await screen.findByRole("tab", { name: "Season 2" });
    expect(screen.getAllByRole("tab").map((node) => node.textContent)).toEqual(["Season 1", "Season 2", "Specials"]);
    expect(tab("Season 2")).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("link", { name: "Opener of se2, Episode 1" })).toBeInTheDocument();
    expect(gateway.episodes).not.toHaveBeenCalledWith("series-1", "se1", expect.anything());
  });

  it("reopens the season that was shown when the user comes back", async () => {
    await renderSeries(fakeGateway({ seriesNextUp: vi.fn().mockResolvedValue(NEXT) }), "series-1", { season: "se2" });
    await screen.findByRole("tab", { name: "Season 2" });
    expect(tab("Season 2")).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to the next episode's season when the remembered season is gone", async () => {
    await renderSeries(fakeGateway({ seriesNextUp: vi.fn().mockResolvedValue(NEXT) }), "series-1", { season: "gone" });
    await screen.findByRole("tab", { name: "Season 1" });
    expect(tab("Season 1")).toHaveAttribute("aria-selected", "true");
  });

  it("opens the next episode's season by number when the server omits SeasonId", async () => {
    const { seasonId: _seasonId, ...bare } = NEXT;
    await renderSeries(fakeGateway({ seriesNextUp: vi.fn().mockResolvedValue({ ...bare, seasonNumber: 2 }) }));
    await screen.findByRole("tab", { name: "Season 2" });
    expect(tab("Season 2")).toHaveAttribute("aria-selected", "true");
  });

  it("shows the first season's episodes and loads another on click and ArrowRight", async () => {
    const gateway = fakeGateway();
    await renderSeries(gateway);
    expect(await screen.findByRole("link", { name: "Opener of se1, Episode 1" })).toHaveAttribute("data-variant", "episode");
    expect(gateway.episodes).toHaveBeenCalledWith("series-1", "se1", expect.any(AbortSignal));

    fireEvent.click(tab("Season 2"));
    expect(await screen.findByRole("link", { name: "Opener of se2, Episode 1" })).toBeInTheDocument();
    expect(tab("Season 2")).toHaveAttribute("aria-selected", "true");
    expect(gateway.episodes).toHaveBeenCalledWith("series-1", "se2", expect.any(AbortSignal));

    tab("Season 2").focus();
    fireEvent.keyDown(tab("Season 2"), { key: "ArrowLeft" });
    expect(tab("Season 1")).toHaveAttribute("aria-selected", "true");
  });

  it("opens the first regular season, not Specials", async () => {
    const gateway = fakeGateway({
      seasons: vi.fn().mockResolvedValue([
        { id: "sp", name: "Specials", indexNumber: 0 },
        { id: "se1", name: "Season 1", indexNumber: 1 },
      ]),
    });
    await renderSeries(gateway);
    expect(await screen.findByRole("link", { name: "Opener of se1, Episode 1" })).toBeInTheDocument();
    expect(gateway.episodes).not.toHaveBeenCalledWith("series-1", "sp", expect.anything());
  });

  it("falls back to Specials when it is the only season", async () => {
    const gateway = fakeGateway({ seasons: vi.fn().mockResolvedValue([{ id: "sp", name: "Specials", indexNumber: 0 }]) });
    await renderSeries(gateway);
    expect(await screen.findByRole("link", { name: "Opener of sp, Episode 1" })).toBeInTheDocument();
  });
});

describe("episodes", () => {
  const rows = [
    episode("e1", "Pilot", { episodeNumber: 1, runTimeTicks: 45 * TICKS_PER_MINUTE }),
    episode("e2", "Second", { episodeNumber: 2, runTimeTicks: 45 * TICKS_PER_MINUTE, progress: 0.49, remainingTicks: 23 * TICKS_PER_MINUTE, resumePositionTicks: 22 * TICKS_PER_MINUTE }),
  ];

  it("shows each row's number, runtime or time left, and overview, and plays the resume position", async () => {
    await renderSeries(fakeGateway({ episodes: vi.fn().mockResolvedValue(rows) }));
    const pilot = await screen.findByRole("link", { name: "Pilot, Episode 1" });
    expect(pilot).toHaveAttribute("href", "#/next/play/e1");
    expect(within(pilot).getByText("45 min")).toBeInTheDocument();
    const second = screen.getByRole("link", { name: "Second, Episode 1, 23 minutes left" });
    expect(second).toHaveAttribute("href", `#/next/play/e2?start=${22 * TICKS_PER_MINUTE}`);
    expect(within(second).getByText("23 min left")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Details for Second" })).toHaveAttribute("href", "#/next/item/e2");
  });

  it("moves between episodes and the tabs with the arrow keys", async () => {
    await renderSeries(fakeGateway({ seriesNextUp: vi.fn().mockResolvedValue(NEXT), episodes: vi.fn().mockResolvedValue(rows) }));
    const pilot = await screen.findByRole("link", { name: "Pilot, Episode 1" });
    pilot.focus();
    fireEvent.keyDown(pilot, { key: "ArrowDown" });
    const second = screen.getByRole("link", { name: /^Second, / });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(pilot).toHaveFocus();
    fireEvent.keyDown(pilot, { key: "ArrowUp" });
    expect(tab("Season 1")).toHaveFocus();
    fireEvent.keyDown(tab("Season 1"), { key: "ArrowUp" });
    expect(screen.getByRole("link", { name: "Resume S1 · E2" })).toHaveFocus();
  });
});
