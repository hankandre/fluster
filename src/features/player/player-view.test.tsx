import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import { PlaybackRefusedError, type PlaybackPlan, type PlaybackSnapshot } from "../../domain/playback";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { PlayerRouteView } from "./index";

const detail: ItemDetail = {
  id: "m1",
  type: "Movie",
  title: "Arrival",
  genres: [],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};

function plan(playSessionId = "play-1"): PlaybackPlan {
  return {
    itemId: "m1",
    title: "Arrival",
    streamUrl: "https://media.test/Videos/m1/stream?api_key=secret",
    mediaSourceId: "src-hd",
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
  };
}

const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  durationSeconds: 120,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return fakeSessionGateway({
    itemDetail: vi.fn().mockResolvedValue(detail),
    createPlaybackPlan: vi.fn().mockResolvedValue(plan()),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderPlayer(gateway: SessionGateway, engine: FakePlayerEngine, startTicks = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionProvider createGateway={() => gateway}>
        <PlayerServicesProvider services={{ engine }}>
          <SignIn gateway={gateway} />
          <PlayerRouteView itemId="m1" mediaSourceId="src-hd" startTicks={startTicks} />
        </PlayerServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
  return client;
}

async function startPlaying(engine: FakePlayerEngine) {
  await waitFor(() => expect(engine.launch).toHaveBeenCalled());
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot });
    engine.emit({ kind: "first-frame" });
  });
}

beforeEach(() => {
  window.location.hash = "#/next/play/m1?source=src-hd";
});

afterEach(cleanup);

describe("Player feature", () => {
  it("negotiates the chosen version and start position, then reports start", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, 420_000_000);

    await startPlaying(engine);

    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1", name: "Arrival", type: "Movie" }),
      420_000_000,
      expect.any(AbortSignal),
      "src-hd",
    );
    expect(engine.launch).toHaveBeenCalledWith(plan());
    await waitFor(() => expect(gateway.reportStart).toHaveBeenCalledWith(plan(), snapshot, expect.any(AbortSignal)));
    expect(screen.getByRole("heading", { name: "Arrival", level: 1 })).toBeInTheDocument();
  });

  it("Back stops the player, reports stopped, and returns to the detail view", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan(), snapshot, expect.any(AbortSignal), false);
  });

  it("returns to the detail view and refreshes it when the file ends", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine);

    await act(async () => {
      engine.emit({ kind: "ended", reason: "eof", snapshot: { ...snapshot, positionSeconds: 120 } });
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
    expect(gateway.reportStopped).toHaveBeenCalledWith(
      plan(),
      expect.objectContaining({ positionSeconds: 120 }),
      expect.any(AbortSignal),
      false,
    );
    await waitFor(() => expect(gateway.itemDetail).toHaveBeenCalledTimes(2));
  });

  it("reports a failed session, offers Retry with a fresh session, and Back still returns", async () => {
    const gateway = fakeGateway({
      createPlaybackPlan: vi.fn()
        .mockResolvedValueOnce(plan("play-1"))
        .mockResolvedValueOnce(plan("play-2")),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine);

    await act(async () => {
      engine.emit({ kind: "error", message: "Decoder failed at https://media.test/x?api_key=secret" });
      engine.emit({ kind: "ended", reason: "error", snapshot });
    });

    expect(await screen.findByRole("heading", { name: "Playback could not start" })).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan("play-1"), snapshot, expect.any(AbortSignal), true);
    expect(window.location.hash).not.toBe("#/next/item/m1");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2")));
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { name: "Playback could not start" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  it("shows a launch failure with Retry and Back", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    engine.launch.mockRejectedValueOnce(new Error("The video surface is not ready."));
    await renderPlayer(gateway, engine);

    expect(await screen.findByText("The video surface is not ready.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();

    const backButtons = screen.getAllByRole("button", { name: "Back to library" });
    await act(async () => {
      fireEvent.click(backButtons[backButtons.length - 1]);
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  it("shows a refusal with Back and no way to play anyway", async () => {
    const gateway = fakeGateway({
      createPlaybackPlan: vi.fn().mockRejectedValue(new PlaybackRefusedError({ reason: "disc-source" })),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);

    expect(await screen.findByRole("heading", { name: "This item can’t be played" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Blu-ray or DVD folder");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(engine.launch).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to details" }));
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  it("stops playback when the view goes away without Back", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine);

    cleanup();

    await waitFor(() => expect(engine.stop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(gateway.reportStopped).toHaveBeenCalledWith(plan(), snapshot, expect.any(AbortSignal), false));
  });
});
