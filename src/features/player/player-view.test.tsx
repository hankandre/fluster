import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import { PlaybackRefusedError, type PlaybackPlan, type PlaybackSnapshot } from "../../domain/playback";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { PlayerRouteView } from "./index";
import { REFUSAL_COPY } from "./refusal-copy";

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
    streamUrl: "https://media.test/Videos/m1/stream?Static=true",
    mediaSourceId: "src-hd",
    authorization: 'MediaBrowser Client="Fluster", Token="test"',
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

  it("explains a refusal, focuses the heading, and offers Retry and Back but no way to play anyway", async () => {
    const gateway = fakeGateway({
      createPlaybackPlan: vi.fn().mockRejectedValue(new PlaybackRefusedError({ reason: "disc-source", detail: "BluRay" })),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);

    const heading = await screen.findByRole("heading", { name: REFUSAL_COPY["disc-source"].title });
    expect(heading).toHaveFocus();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(REFUSAL_COPY["disc-source"].explanation);
    expect(alert).toHaveTextContent(REFUSAL_COPY["disc-source"].whatYouCanDo);
    expect(screen.queryByText(/BluRay/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.queryByText(/play anyway|transcod/i)).not.toBeInTheDocument();
    expect(engine.launch).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to details" }));
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  it("Retry on a refusal negotiates again and plays once the server allows it", async () => {
    const gateway = fakeGateway({
      createPlaybackPlan: vi.fn()
        .mockRejectedValueOnce(new PlaybackRefusedError({ reason: "no-direct-play" }))
        .mockResolvedValueOnce(plan("play-2")),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await screen.findByRole("heading", { name: REFUSAL_COPY["no-direct-play"].title });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    await waitFor(() => expect(engine.launch).toHaveBeenCalledWith(plan("play-2")));
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { name: REFUSAL_COPY["no-direct-play"].title })).not.toBeInTheDocument();
  });

  it("Retry keeps the refusal on screen when the server still refuses", async () => {
    const gateway = fakeGateway({
      createPlaybackPlan: vi.fn().mockRejectedValue(new PlaybackRefusedError({ reason: "no-direct-play" })),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await screen.findByRole("heading", { name: REFUSAL_COPY["no-direct-play"].title });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: REFUSAL_COPY["no-direct-play"].title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(engine.launch).not.toHaveBeenCalled();
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

  describe("sessions on one engine", () => {
    // Renders the player for `session`, or nothing when it is undefined, on a
    // shared client and engine so a test can end one session and start another.
    function harness(gateway: SessionGateway, engine: FakePlayerEngine, strict = false) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const tree = (session: number | undefined): ReactNode => {
        const content = (
          <QueryClientProvider client={client}>
            <SessionProvider createGateway={() => gateway}>
              <PlayerServicesProvider services={{ engine }}>
                <SignIn gateway={gateway} />
                {session === undefined ? null : <PlayerRouteView key={session} itemId="m1" mediaSourceId="src-hd" startTicks={0} />}
              </PlayerServicesProvider>
            </SessionProvider>
          </QueryClientProvider>
        );
        return strict ? <StrictMode>{content}</StrictMode> : content;
      };
      return tree;
    }

    function deferStops(engine: FakePlayerEngine): Array<() => void> {
      const resolvers: Array<() => void> = [];
      engine.stop.mockImplementation(() => new Promise<undefined>((resolve) => {
        resolvers.push(() => resolve(undefined));
      }));
      return resolvers;
    }

    async function signIn() {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
      });
    }

    it("negotiates, launches, and stops exactly once under StrictMode", async () => {
      const gateway = fakeGateway();
      const engine = new FakePlayerEngine();
      const tree = harness(gateway, engine, true);
      render(tree(1));
      await signIn();
      await startPlaying(engine);

      expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
      expect(engine.launch).toHaveBeenCalledTimes(1);
      expect(engine.stop).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
      });
      await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
      expect(engine.stop).toHaveBeenCalledTimes(1);
      expect(gateway.reportStopped).toHaveBeenCalledTimes(1);
    });

    it("waits for the previous session's stop before negotiating the next one", async () => {
      const gateway = fakeGateway({
        createPlaybackPlan: vi.fn().mockResolvedValueOnce(plan("play-1")).mockResolvedValueOnce(plan("play-2")),
      });
      const engine = new FakePlayerEngine();
      const tree = harness(gateway, engine);
      const { rerender } = render(tree(1));
      await signIn();
      await startPlaying(engine);
      const stops = deferStops(engine);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
      });
      await waitFor(() => expect(engine.stop).toHaveBeenCalledTimes(1));
      rerender(tree(undefined));
      rerender(tree(2));
      await screen.findByRole("button", { name: "Back to library" });
      await act(async () => undefined);
      expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);

      await act(async () => stops[0]());
      await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2")));
      expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    });

    it("never starts a session whose Back came before the previous stop finished", async () => {
      const gateway = fakeGateway();
      const engine = new FakePlayerEngine();
      const tree = harness(gateway, engine);
      const { rerender } = render(tree(1));
      await signIn();
      await startPlaying(engine);
      const stops = deferStops(engine);

      // Session 1 goes away without Back; its stop is still running.
      rerender(tree(undefined));
      await waitFor(() => expect(engine.stop).toHaveBeenCalledTimes(1));
      rerender(tree(2));
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Back to library" }));
      });

      await act(async () => stops[0]());
      await act(async () => stops[1]?.());
      await act(async () => undefined);
      await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));

      expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
      expect(engine.launch).toHaveBeenCalledTimes(1);
      expect(engine.subscribe).toHaveBeenCalledTimes(1);
    });
  });
});
