import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import { ItemNotFoundError, type EpisodeCard, type ItemDetail, type ItemVersion } from "../../domain/catalog";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { ItemDetailView } from "./index";

vi.mock("../home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

const hdrVersion: ItemVersion = {
  id: "src-4k",
  name: "4K HDR",
  container: "mkv",
  sizeBytes: 12 * 1024 ** 3,
  video: { codec: "hevc", profile: "Main 10", width: 3840, height: 2160, bitDepth: 10, hdr: "HDR10" },
  audio: [
    { language: "eng", codec: "eac3", channels: 6, isDefault: true },
    { language: "fra", codec: "aac", channels: 2, isDefault: false },
  ],
  subtitles: [
    { language: "eng", codec: "subrip", isExternal: false, isDefault: true, isForced: false },
    { language: "fra", codec: "pgssub", isExternal: true, isDefault: false, isForced: true },
  ],
};

const sdrVersion: ItemVersion = {
  id: "src-hd",
  name: "1080p",
  container: "mp4",
  video: { codec: "h264", width: 1920, height: 1080, bitDepth: 8, hdr: "SDR" },
  audio: [{ language: "eng", codec: "aac", channels: 2, isDefault: true }],
  subtitles: [],
};

function detail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: "m1",
    type: "Movie",
    title: "Arrival",
    year: 2016,
    runTimeTicks: 7_000 * 600_000_000 / 60,
    overview: "Linguist meets aliens.",
    genres: ["Sci-Fi"],
    cast: [{ name: "Amy Adams", role: "Louise" }],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions: [hdrVersion, sdrVersion],
    poster: { itemId: "m1", type: "Primary", tag: "p1", blurHash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" },
    backdrop: { itemId: "m1", type: "Backdrop", tag: "b1", blurHash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" },
    ...overrides,
  };
}

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return fakeSessionGateway({
    itemDetail: vi.fn().mockResolvedValue(detail()),
    setPlayed: vi.fn().mockResolvedValue(undefined),
    setFavorite: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderDetail(gateway: SessionGateway, itemId = "m1", client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <SessionProvider createGateway={() => gateway}>
        <SignIn gateway={gateway} />
        <ItemDetailView itemId={itemId} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

beforeEach(() => {
  window.location.hash = "#/next/item/m1";
});

afterEach(cleanup);

describe("media info", () => {
  it("requests the item and shows codec, HDR, audio, and subtitles of the first version", async () => {
    const gateway = fakeGateway();
    await renderDetail(gateway);
    expect(await screen.findByRole("heading", { level: 1, name: "Arrival" })).toBeInTheDocument();
    expect(gateway.itemDetail).toHaveBeenCalledWith("m1", expect.any(AbortSignal));

    const info = screen.getByRole("region", { name: "Media info for 4K HDR" });
    expect(within(info).getByText("HEVC · Main 10 · 3840×2160 · 10-bit")).toBeInTheDocument();
    expect(within(info).getByText("HDR10")).toBeInTheDocument();
    expect(within(info).getByText("English · E-AC-3 5.1 · default")).toBeInTheDocument();
    expect(within(info).getByText("French · AAC Stereo")).toBeInTheDocument();
    expect(within(info).getByText("English · SRT · default")).toBeInTheDocument();
    expect(within(info).getByText("French · PGS · external · forced")).toBeInTheDocument();
    expect(within(info).getByText("MKV · 12.0 GB")).toBeInTheDocument();
  });

  it("shows overview, genres, year, runtime, and cast", async () => {
    await renderDetail(fakeGateway());
    expect(await screen.findByText("Linguist meets aliens.")).toBeInTheDocument();
    expect(screen.getByText("2016 · 1 h 57 min · Sci-Fi")).toBeInTheDocument();
    const cast = screen.getByRole("region", { name: "Cast" });
    expect(within(cast).getByText("Amy Adams")).toBeInTheDocument();
    expect(within(cast).getByText("Louise")).toBeInTheDocument();
    expect(within(cast).getByText("AA")).toBeInTheDocument();
  });

  it("shows None when a version has no subtitles", async () => {
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(detail({ versions: [sdrVersion] })) }));
    const info = await screen.findByRole("region", { name: "Media info for 1080p" });
    expect(within(info).getByText("Subtitles").nextElementSibling).toHaveTextContent("None");
  });

  it("shows the poster beside the text, with its blurhash placeholder, only when there is no backdrop", async () => {
    const gateway = fakeGateway({ itemDetail: vi.fn().mockResolvedValue(detail({ backdrop: undefined })) });
    await renderDetail(gateway);
    const image = await screen.findByTestId("card-image");
    expect(image).toHaveAttribute("data-placeholder", "blurhash");
    expect(gateway.imageUrl).toHaveBeenCalledWith("m1", "Primary", "p1", 400);
  });

  it("shows no poster when a backdrop exists", async () => {
    const gateway = fakeGateway();
    await renderDetail(gateway);
    await screen.findByRole("heading", { level: 1, name: "Arrival" });
    expect(gateway.imageUrl).not.toHaveBeenCalledWith("m1", "Primary", expect.anything(), expect.anything());
  });

  it("lists the badges of the chosen version", async () => {
    await renderDetail(fakeGateway());
    const badges = await screen.findByRole("list", { name: "Media badges" });
    expect(within(badges).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["4K", "HDR10", "E-AC-3 5.1", "PGS"]);
  });
});

describe("versions", () => {
  const pickerTrigger = () => screen.getByRole("button", { name: /^Version/ });

  it("lists versions by name in the Picker and switches the media info", async () => {
    const user = userEvent.setup();
    await renderDetail(fakeGateway());
    await screen.findByRole("region", { name: "Media info for 4K HDR" });
    expect(pickerTrigger()).toHaveTextContent("4K HDR");
    await user.click(pickerTrigger());
    const hd = screen.getByRole("option", { name: /^1080p/ });
    expect(screen.getByRole("option", { name: /^4K HDR/ })).toHaveAttribute("aria-selected", "true");
    await user.click(hd);

    const info = screen.getByRole("region", { name: "Media info for 1080p" });
    expect(within(info).getByText("H.264 · 1920×1080 · 8-bit")).toBeInTheDocument();
    expect(within(info).getByText("SDR")).toBeInTheDocument();
    expect(screen.queryByText("HDR10")).not.toBeInTheDocument();
    expect(screen.getByText("Version: 1080p")).toBeInTheDocument();
  });

  it("switches version with the arrow keys in the listbox", async () => {
    const user = userEvent.setup();
    await renderDetail(fakeGateway());
    await screen.findByRole("region", { name: "Media info for 4K HDR" });
    pickerTrigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /^4K HDR/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("region", { name: "Media info for 1080p" })).toBeInTheDocument();
    expect(pickerTrigger()).toHaveFocus();
  });

  it("hides the picker for a single version", async () => {
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(detail({ versions: [hdrVersion] })) }));
    await screen.findByRole("region", { name: "Media info for 4K HDR" });
    expect(screen.queryByRole("button", { name: /^Version/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Version:/)).not.toBeInTheDocument();
  });
});

describe("watch state", () => {
  it("shows the server's played and favorite state", async () => {
    const data = detail({ userData: { played: true, favorite: false, resumePositionTicks: 0 } });
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(data) }));
    expect(await screen.findByRole("button", { name: "Watched" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks a favorite before the server answers, then refetches", async () => {
    let answer: () => void = () => undefined;
    const setFavorite = vi.fn().mockReturnValue(new Promise<void>((resolve) => { answer = resolve; }));
    const itemDetail = vi.fn()
      .mockResolvedValueOnce(detail())
      .mockResolvedValue(detail({ userData: { played: false, favorite: true, resumePositionTicks: 0 } }));
    const gateway = fakeGateway({ itemDetail, setFavorite });
    await renderDetail(gateway);
    fireEvent.click(await screen.findByRole("button", { name: "Favorite" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "true"));
    expect(setFavorite).toHaveBeenCalledWith("m1", true);
    expect(itemDetail).toHaveBeenCalledTimes(1);
    await act(async () => answer());
    await waitFor(() => expect(itemDetail).toHaveBeenCalledTimes(2));
    expect(gateway.setPlayed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "true");
  });

  it("refreshes the home rows after a change", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await renderDetail(fakeGateway(), "m1", client);
    fireEvent.click(await screen.findByRole("button", { name: "Watched" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["home"] })));
  });

  it("unmarks watched with false", async () => {
    const data = detail({ userData: { played: true, favorite: false, resumePositionTicks: 0 } });
    const gateway = fakeGateway({ itemDetail: vi.fn().mockResolvedValue(data) });
    await renderDetail(gateway);
    fireEvent.click(await screen.findByRole("button", { name: "Watched" }));
    await waitFor(() => expect(gateway.setPlayed).toHaveBeenCalledWith("m1", false));
  });

  it("rolls the toggle back and says so when the server refuses", async () => {
    const gateway = fakeGateway({ setFavorite: vi.fn().mockRejectedValue(new Error("boom")) });
    await renderDetail(gateway);
    fireEvent.click(await screen.findByRole("button", { name: "Favorite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't update favorite");
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "false");
  });

  it("rolls back only the failed flag when the other changed meanwhile", async () => {
    let failFavorite: (reason: Error) => void = () => undefined;
    const setFavorite = vi.fn().mockReturnValue(new Promise<void>((_resolve, reject) => { failFavorite = reject; }));
    // The refetch after Watched settles still reports the old favorite state.
    const itemDetail = vi.fn().mockImplementation(() => Promise.resolve(detail({ userData: { played: true, favorite: false, resumePositionTicks: 0 } })));
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValueOnce(detail()).mockImplementation(itemDetail), setFavorite }));
    fireEvent.click(await screen.findByRole("button", { name: "Favorite" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Watched" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Watched" })).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Watched" })).toHaveAttribute("aria-disabled", "false"));
    // Watched is settled; favorite is still pending and still shown as set.
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "true");
    await act(async () => failFavorite(new Error("boom")));
    await waitFor(() => expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByRole("button", { name: "Watched" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps focus on the toggled button and ignores clicks while it is pending", async () => {
    let answer: () => void = () => undefined;
    const setFavorite = vi.fn().mockReturnValue(new Promise<void>((resolve) => { answer = resolve; }));
    await renderDetail(fakeGateway({ setFavorite }));
    const button = await screen.findByRole("button", { name: "Favorite" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(setFavorite).toHaveBeenCalledTimes(1);
    await act(async () => answer());
    expect(button).toHaveFocus();
  });

  it("toggles with the keyboard", async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    await renderDetail(gateway);
    const button = await screen.findByRole("button", { name: "Watched" });
    button.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(gateway.setPlayed).toHaveBeenCalledWith("m1", true));
  });
});

describe("route behavior", () => {
  it("focuses the title heading once the item loads, and has exactly one h1", async () => {
    await renderDetail(fakeGateway());
    const heading = await screen.findByRole("heading", { level: 1, name: "Arrival" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Back to home" })).not.toBeInTheDocument();
  });

  it("shows one h1 while loading and when the load fails", async () => {
    let fail: (reason: Error) => void = () => undefined;
    const itemDetail = vi.fn().mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    await renderDetail(fakeGateway({ itemDetail }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Loading details" })).toBeInTheDocument();
    await act(async () => fail(new Error("down")));
    const heading = await screen.findByRole("heading", { level: 1, name: "Couldn't load this item" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("uses the Logo as the h1 for a movie, and text for an episode whose logo is the series'", async () => {
    const logo = { itemId: "m1", type: "Logo" as const, tag: "lg" };
    const gateway = fakeGateway({ itemDetail: vi.fn().mockResolvedValue(detail({ logo })) });
    await renderDetail(gateway);
    const heading = await screen.findByRole("heading", { level: 1, name: "Arrival" });
    expect(within(heading).getByRole("img", { name: "Arrival" })).toBeInTheDocument();
    expect(gateway.imageUrl).toHaveBeenCalledWith("m1", "Logo", "lg", 800);
    cleanup();

    const episode = detail({ id: "e2", type: "Episode", title: "The Keeper's Log", logo: { itemId: "s1", type: "Logo", tag: "slg" } });
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(episode) }), "e2");
    const text = await screen.findByRole("heading", { level: 1, name: "The Keeper's Log" });
    expect(within(text).queryByRole("img")).toBeNull();
  });

  it("offers a retry when the item fails to load", async () => {
    const itemDetail = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(detail());
    await renderDetail(fakeGateway({ itemDetail }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Arrival" })).toBeInTheDocument();
  });

  it("shows a notice without retry when the item is no longer on the server", async () => {
    const itemDetail = vi.fn().mockRejectedValue(new ItemNotFoundError());
    await renderDetail(fakeGateway({ itemDetail }));
    const heading = await screen.findByRole("heading", { level: 1, name: "This item is no longer on the server" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("It may have been removed or renamed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "#/next/home");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(itemDetail).toHaveBeenCalledTimes(1);
  });

  describe("an episode", () => {
    const episodeCards = [
      { id: "e1", title: "Landfall", aspectRatio: 16 / 9, kind: "Episode", seasonNumber: 1, episodeNumber: 1 },
      { id: "e2", title: "The Keeper's Log", aspectRatio: 16 / 9, kind: "Episode", seasonNumber: 1, episodeNumber: 2 },
      { id: "e3", title: "Fog Signal", aspectRatio: 16 / 9, kind: "Episode", seasonNumber: 1, episodeNumber: 3 },
    ] as EpisodeCard[];
    const episode = detail({
      id: "e2",
      type: "Episode",
      title: "The Keeper's Log",
      seriesId: "s1",
      seriesName: "Harbor Lights",
      seasonId: "se1",
      seasonName: "Season 1",
      seasonNumber: 1,
      episodeNumber: 2,
      runTimeTicks: 45 * 600_000_000,
      genres: ["Drama"],
    });

    it("shows the series link, the facts, and the season's other episodes", async () => {
      const episodes = vi.fn().mockResolvedValue(episodeCards);
      await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(episode), episodes }), "e2");
      expect(await screen.findByRole("link", { name: "Harbor Lights" })).toHaveAttribute("href", "#/next/series/s1");
      expect(screen.getByText("S1 · E2 · 45 min · Drama")).toBeInTheDocument();
      const strip = await screen.findByRole("region", { name: "More from Season 1" });
      expect(within(strip).getByRole("link", { name: /Landfall/ })).toHaveAttribute("href", "#/next/item/e1");
      expect(within(strip).getByRole("link", { name: /Fog Signal/ })).toBeInTheDocument();
      expect(within(strip).queryByRole("link", { name: /Keeper/ })).not.toBeInTheDocument();
      expect(episodes).toHaveBeenCalledWith("s1", "se1", expect.any(AbortSignal));
    });

    it("shows the series name as plain text without a series id", async () => {
      const { seriesId: _seriesId, ...withoutId } = episode;
      await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(withoutId), episodes: vi.fn().mockResolvedValue([]) }), "e2");
      await screen.findByRole("heading", { level: 1, name: "The Keeper's Log" });
      expect(screen.getByText("Harbor Lights")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Harbor Lights" })).not.toBeInTheDocument();
    });
  });

  it("redirects to sign-in when signed out", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider createGateway={() => fakeGateway()}>
          <ItemDetailView itemId="m1" />
        </SessionProvider>
      </QueryClientProvider>,
    );
    expect(window.location.hash).toBe("#/next/sign-in");
  });
});

describe("play actions", () => {
  it("offers Play for the selected version when there is nothing to resume", async () => {
    await renderDetail(fakeGateway());
    const play = await screen.findByRole("link", { name: "Play" });
    expect(play).toHaveAttribute("href", "#/next/play/m1?source=src-4k");
    expect(screen.queryByRole("link", { name: /Resume/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Version/ }));
    await userEvent.click(screen.getByRole("option", { name: /^1080p/ }));
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/m1?source=src-hd");
  });

  it("offers Resume from the saved position and Start over", async () => {
    const userData = { played: false, favorite: false, resumePositionTicks: 7_540_000_000 };
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(detail({ userData })) }));
    expect(await screen.findByRole("link", { name: "Resume from 12:34" })).toHaveAttribute(
      "href",
      "#/next/play/m1?source=src-4k&start=7540000000",
    );
    expect(screen.getByRole("link", { name: "Start over" })).toHaveAttribute("href", "#/next/play/m1?source=src-4k");
    expect(screen.queryByRole("link", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume from 12:34" }).querySelector(".ui-progress-ring")).not.toBeNull();
  });

  it("opens the player and marks the entry as opened from this detail view", async () => {
    await renderDetail(fakeGateway());
    await userEvent.click(await screen.findByRole("link", { name: "Play" }));
    expect(window.location.hash).toBe("#/next/play/m1?source=src-4k");
    expect(window.history.state).toMatchObject({ playerFromDetail: "m1" });
  });

  it("does not offer Resume for a played item", async () => {
    const userData = { played: true, favorite: false, resumePositionTicks: 7_540_000_000 };
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(detail({ userData })) }));
    expect(await screen.findByRole("link", { name: "Play" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Resume/ })).not.toBeInTheDocument();
  });
});

describe("player availability", () => {
  async function renderWithEngine(engine: FakePlayerEngine) {
    const gateway = fakeGateway();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionProvider createGateway={() => gateway}>
          <PlayerServicesProvider services={{ engine }}>
            <SignIn gateway={gateway} />
            <ItemDetailView itemId="m1" />
          </PlayerServicesProvider>
        </SessionProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
    });
  }

  it("says why the native player cannot start before Play is pressed, without secrets", async () => {
    const engine = new FakePlayerEngine();
    engine.initialize.mockRejectedValue("libmpv 0.30 is too old; need 0.35 (token=SECRET-TOKEN)");
    await renderWithEngine(engine);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("libmpv 0.30 is too old; need 0.35");
    expect(alert.textContent).not.toContain("SECRET-TOKEN");
    expect(screen.getByRole("link", { name: /Play/ })).toBeInTheDocument();
  });

  it("hides paths and addresses in the reason, and Check again asks the player again", async () => {
    const engine = new FakePlayerEngine();
    engine.initialize.mockRejectedValueOnce(
      "x: /usr/lib/x86_64-linux-gnu/libEGL.so.1 file:///home/u/x ftp://h/x C:\\Users\\u\\x.dll api_key=SECRET-TOKEN",
    );
    await renderWithEngine(engine);
    const alert = await screen.findByRole("alert");
    for (const leak of ["libEGL", "/home/u", "ftp://", "x.dll", "SECRET-TOKEN"]) expect(alert.textContent).not.toContain(leak);

    expect(screen.getByRole("button", { name: "Check again" }).closest("[data-spatial-row]")).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(engine.initialize).toHaveBeenCalledTimes(2);
  });

  it("shows no warning when the player starts", async () => {
    await renderWithEngine(new FakePlayerEngine());
    await screen.findByRole("link", { name: "Play" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
