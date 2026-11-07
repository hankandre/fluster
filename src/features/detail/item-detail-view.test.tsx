import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail, ItemVersion } from "../../domain/catalog";
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
    expect(await screen.findByRole("heading", { name: "Arrival" })).toBeInTheDocument();
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
    expect(screen.getByText("2016 · 1 h 57 min")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
    expect(screen.getByText("Amy Adams as Louise")).toBeInTheDocument();
  });

  it("shows None when a version has no subtitles", async () => {
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(detail({ versions: [sdrVersion] })) }));
    const info = await screen.findByRole("region", { name: "Media info for 1080p" });
    expect(within(info).getByText("Subtitles").nextElementSibling).toHaveTextContent("None");
  });

  it("renders the poster with its blurhash placeholder", async () => {
    const gateway = fakeGateway();
    await renderDetail(gateway);
    const image = await screen.findByTestId("card-image");
    expect(image).toHaveAttribute("data-placeholder", "blurhash");
    expect(gateway.imageUrl).toHaveBeenCalledWith("m1", "Primary", "p1", 400);
  });
});

describe("versions", () => {
  it("lists versions by name and switches the media info", async () => {
    await renderDetail(fakeGateway());
    const group = await screen.findByRole("group", { name: "Version" });
    const hdr = within(group).getByRole("radio", { name: "4K HDR" });
    const hd = within(group).getByRole("radio", { name: "1080p" });
    expect(hdr).toBeChecked();

    fireEvent.click(hd);
    expect(hd).toBeChecked();
    const info = screen.getByRole("region", { name: "Media info for 1080p" });
    expect(within(info).getByText("H.264 · 1920×1080 · 8-bit")).toBeInTheDocument();
    expect(within(info).getByText("SDR")).toBeInTheDocument();
    expect(screen.queryByText("HDR10")).not.toBeInTheDocument();
  });

  it("switches version with the arrow keys", async () => {
    const user = userEvent.setup();
    await renderDetail(fakeGateway());
    const hdr = await screen.findByRole("radio", { name: "4K HDR" });
    hdr.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "1080p" })).toBeChecked();
    expect(screen.getByRole("region", { name: "Media info for 1080p" })).toBeInTheDocument();
  });

  it("hides the picker for a single version", async () => {
    await renderDetail(fakeGateway({ itemDetail: vi.fn().mockResolvedValue(detail({ versions: [hdrVersion] })) }));
    await screen.findByRole("region", { name: "Media info for 4K HDR" });
    expect(screen.queryByRole("group", { name: "Version" })).not.toBeInTheDocument();
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update favorite");
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "false");
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
  it("focuses the heading and links back to home", async () => {
    await renderDetail(fakeGateway());
    expect(screen.getByRole("heading", { name: "Details" })).toHaveFocus();
    expect(await screen.findByRole("link", { name: "Back to home" })).toHaveAttribute("href", "#/next/home");
  });

  it("offers a retry when the item fails to load", async () => {
    const itemDetail = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(detail());
    await renderDetail(fakeGateway({ itemDetail }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Arrival" })).toBeInTheDocument();
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
