import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { PlayerRouteView } from "./index";

function movie(chapters: ItemDetail["chapters"]): ItemDetail {
  return {
    id: "m1",
    type: "Movie",
    title: "Arrival",
    genres: [],
    cast: [],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions: [],
    chapters,
  };
}

const chapters = [
  { startSeconds: 0, name: "Opening" },
  { startSeconds: 300, name: "Contact" },
  { startSeconds: 900, name: "Finale" },
];

const plan: PlaybackPlan = {
  itemId: "m1",
  title: "Arrival",
  streamUrl: "https://media.test/Videos/m1/stream?Static=true",
  mediaSourceId: "src",
  playSessionId: "play-1",
  startPositionTicks: 0,
  tracks: [],
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};

const snapshot: PlaybackSnapshot = {
  positionSeconds: 400,
  durationSeconds: 1200,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

function Router() {
  const { gateway } = useSession();
  return gateway ? <PlayerRouteView itemId="m1" mediaSourceId="src" startTicks={0} /> : null;
}

async function renderPlayer(detail: ItemDetail) {
  const gateway = fakeSessionGateway({
    itemDetail: vi.fn().mockResolvedValue(detail),
    createPlaybackPlan: vi.fn().mockResolvedValue(plan),
  });
  const engine = new FakePlayerEngine();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionProvider createGateway={() => gateway}>
        <PlayerServicesProvider services={{ engine }}>
          <SignIn gateway={gateway} />
          <Router />
        </PlayerServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
  await waitFor(() => expect(engine.launch).toHaveBeenCalledTimes(1));
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot });
    engine.emit({ kind: "first-frame" });
  });
  return engine;
}

beforeEach(() => {
  window.location.hash = "#/next/play/m1";
});

afterEach(cleanup);

describe("Chapter list in the player", () => {
  it("has no Chapters button without chapters", async () => {
    await renderPlayer(movie(undefined));
    expect(screen.getByRole("button", { name: "Info" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chapters" })).not.toBeInTheDocument();
    cleanup();
    await renderPlayer(movie([]));
    expect(screen.queryByRole("button", { name: "Chapters" })).not.toBeInTheDocument();
  });

  it("opens on the current chapter, seeks and closes on Enter, and returns focus to Chapters", async () => {
    const engine = await renderPlayer(movie(chapters));
    const button = await screen.findByRole("button", { name: "Chapters" });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole("region", { name: "Chapters" })).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
    const current = screen.getByRole("option", { name: /Contact/ });
    expect(current).toHaveFocus();
    expect(current).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(current, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("option", { name: /Finale/ }), { key: "Enter" });
    expect(engine.seek).toHaveBeenCalledWith(900);
    expect(screen.queryByRole("region", { name: "Chapters" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("closes on Escape with focus on Chapters, without leaving the player", async () => {
    await renderPlayer(movie(chapters));
    const button = await screen.findByRole("button", { name: "Chapters" });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole("region", { name: "Chapters" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("option", { name: /Contact/ }), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Chapters" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(window.location.hash).toBe("#/next/play/m1");
    expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument();
  });
});
