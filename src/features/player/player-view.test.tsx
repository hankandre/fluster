import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import { PlaybackRefusedError, UnsupportedDeliveryError, type PlaybackPlan, type PlaybackSnapshot } from "../../domain/playback";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { ItemNotFoundError } from "../../domain/catalog";
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
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
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
      { ignoreStreamingLimit: false },
    );
    expect(engine.launch).toHaveBeenCalledWith(plan(), expect.any(Function));
    await waitFor(() => expect(gateway.reportStart).toHaveBeenCalledWith(plan(), snapshot, expect.any(AbortSignal)));
    expect(screen.getByRole("heading", { name: "Arrival", level: 1 })).toBeInTheDocument();
  });

  // The signed-in header is read only when the engine asks for it at launch;
  // it never enters the plan, the rendered tree, or the Query cache.
  it("never puts the authorization header in the plan, the view, the Query cache, or the engine's arguments", async () => {
    const canary = "CANARY-TOKEN-7f3a91";
    const gateway = fakeGateway({ authorizationHeader: vi.fn(() => `MediaBrowser Client="Fluster", Token="${canary}"`) });
    const engine = new FakePlayerEngine();
    const client = await renderPlayer(gateway, engine);
    await startPlaying(engine);

    const [launchedPlan, readAuthorization] = engine.launch.mock.calls[0] as unknown as [PlaybackPlan, () => string];
    expect(launchedPlan).not.toHaveProperty("authorization");
    expect(JSON.stringify(launchedPlan)).not.toContain(canary);
    expect(gateway.authorizationHeader).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain(canary);
    const cache = JSON.stringify(client.getQueryCache().getAll().map((query) => [query.queryKey, query.state.data]));
    expect(cache).not.toContain(canary);
    const reported = JSON.stringify([
      (gateway.reportStart as ReturnType<typeof vi.fn>).mock.calls,
      (gateway.reportProgress as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(reported).not.toContain(canary);
    expect(readAuthorization()).toContain(canary);
  });

  it("Back stops the player, reports stopped, and returns to the detail view", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
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
    await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2"), expect.any(Function)));
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { name: "Playback could not start" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  // Tauri rejects a native command with a bare string; the native adapter
  // makes it an Error. Both must read the same.
  it.each([
    ["string", "The video surface is not ready."],
    ["Error", new Error("The video surface is not ready.")],
  ])("shows a launch failure (%s) with Retry and Back", async (_label, failure) => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    engine.launch.mockRejectedValueOnce(failure);
    await renderPlayer(gateway, engine);

    expect(await screen.findByText("The video surface is not ready.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();

    // The notice replaces the chrome: its heading is the only h1 and the top bar's Back is gone.
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Playback could not start"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to details" }));
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  it("a failed stop on Back to details does not send a later Escape to the details view", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    engine.launch.mockRejectedValueOnce("The video surface is not ready.");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    await renderPlayer(gateway, engine);
    await screen.findByRole("heading", { name: "Playback could not start" });
    window.history.replaceState({ playerFromDetail: "m1", playerOpenedFromItem: false }, "");

    engine.stop.mockRejectedValueOnce(new Error("stop failed"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to details" }));
    });
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(window.location.hash).not.toBe("#/next/item/m1");
    back.mockRestore();
  });

  it("shows the desktop-only screen with Back and no Retry when the engine refuses a converted plan", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    engine.launch.mockRejectedValueOnce(new UnsupportedDeliveryError("browser", "hls", "unsupported"));
    await renderPlayer(gateway, engine);

    const heading = await screen.findByRole("heading", { name: "This stream needs the desktop player" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByText(/fallback|playback could not start/i)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to details" }));
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
    // The heading renders before its focus effect runs.
    await waitFor(() => expect(heading).toHaveFocus());
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
        .mockRejectedValueOnce(new PlaybackRefusedError({ reason: "conversion-not-allowed" }))
        .mockResolvedValueOnce(plan("play-2")),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await screen.findByRole("heading", { name: REFUSAL_COPY["conversion-not-allowed"].title });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    await waitFor(() => expect(engine.launch).toHaveBeenCalledWith(plan("play-2"), expect.any(Function)));
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { name: REFUSAL_COPY["conversion-not-allowed"].title })).not.toBeInTheDocument();
  });

  it("Retry keeps the refusal on screen when the server still refuses", async () => {
    const gateway = fakeGateway({
      createPlaybackPlan: vi.fn().mockRejectedValue(new PlaybackRefusedError({ reason: "conversion-not-allowed" })),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await screen.findByRole("heading", { name: REFUSAL_COPY["conversion-not-allowed"].title });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: REFUSAL_COPY["conversion-not-allowed"].title })).toBeInTheDocument();
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
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
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
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
      });
      await waitFor(() => expect(engine.stop).toHaveBeenCalledTimes(1));
      rerender(tree(undefined));
      rerender(tree(2));
      await screen.findByRole("button", { name: "Back" });
      await act(async () => undefined);
      expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);

      await act(async () => stops[0]());
      await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2"), expect.any(Function)));
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
        fireEvent.click(await screen.findByRole("button", { name: "Back" }));
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

  describe("skip intro and credits", () => {
    const intro = { kind: "Intro" as const, startSeconds: 10, endSeconds: 70 };
    const segmentsGateway = (segments = [intro], hasSegments = true) => fakeGateway({
      createPlaybackPlan: vi.fn().mockResolvedValue({ ...plan(), hasSegments }),
      mediaSegments: vi.fn().mockResolvedValue(segments),
    });

    it("loads segments for a version with HasSegments and skips the intro on click", async () => {
      const gateway = segmentsGateway();
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);

      await waitFor(() => expect(gateway.mediaSegments).toHaveBeenCalledWith("m1", expect.any(AbortSignal)));
      await act(async () => {
        engine.emit({ kind: "state", snapshot: { ...snapshot, positionSeconds: 5 } });
      });
      expect(screen.queryByRole("button", { name: "Skip intro" })).not.toBeInTheDocument();

      await act(async () => {
        engine.emit({ kind: "state", snapshot: { ...snapshot, positionSeconds: 30 } });
      });
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Skip intro" }));
      });

      expect(engine.seek).toHaveBeenCalledWith(70);
    });

    it("never asks for segments when the version has none", async () => {
      const gateway = segmentsGateway([intro], false);
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);
      await act(async () => {
        engine.emit({ kind: "state", snapshot: { ...snapshot, positionSeconds: 30 } });
      });

      expect(gateway.mediaSegments).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
    });

    it("shows nothing when the server returns no segments", async () => {
      const gateway = segmentsGateway([]);
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);
      await act(async () => {
        engine.emit({ kind: "state", snapshot: { ...snapshot, positionSeconds: 30 } });
      });

      await waitFor(() => expect(gateway.mediaSegments).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
    });

    it("drops the skip button when Retry picks a version without segments", async () => {
      const gateway = fakeGateway({
        createPlaybackPlan: vi.fn()
          .mockResolvedValueOnce({ ...plan("play-1"), hasSegments: true })
          .mockResolvedValueOnce({ ...plan("play-2"), hasSegments: false }),
        mediaSegments: vi.fn().mockResolvedValue([intro]),
      });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);
      await act(async () => {
        engine.emit({ kind: "state", snapshot: { ...snapshot, positionSeconds: 30 } });
      });
      expect(await screen.findByRole("button", { name: "Skip intro" })).toBeInTheDocument();

      await act(async () => {
        engine.emit({ kind: "error", message: "Decoder failed" });
        engine.emit({ kind: "ended", reason: "error", snapshot });
      });
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
      });
      await waitFor(() => expect(engine.launch).toHaveBeenCalledTimes(2));
      await act(async () => {
        engine.emit({ kind: "loaded", snapshot: { ...snapshot, positionSeconds: 30 } });
      });

      expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
      expect(gateway.mediaSegments).toHaveBeenCalledTimes(1);
    });

    it("shows nothing when the segments request fails", async () => {
      const gateway = segmentsGateway();
      vi.mocked(gateway.mediaSegments).mockRejectedValue(new Error("boom"));
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);
      await act(async () => {
        engine.emit({ kind: "state", snapshot: { ...snapshot, positionSeconds: 30 } });
      });

      await waitFor(() => expect(gateway.mediaSegments).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
    });
  });
});

describe("Player keyboard and pointer", () => {
  it("Escape stops the player, reports stopped, and returns to the detail view", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine);

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan(), snapshot, expect.any(AbortSignal), false);
  });

  it("Escape leaves a refusal", async () => {
    const gateway = fakeGateway({
      createPlaybackPlan: vi.fn().mockRejectedValue(new PlaybackRefusedError({ reason: "disc-source" })),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await screen.findByRole("heading", { name: REFUSAL_COPY["disc-source"].title });

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  it("Escape leaves while the item is still loading", async () => {
    const gateway = fakeGateway({ itemDetail: vi.fn(() => new Promise<ItemDetail>(() => undefined)) });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  // jsdom has no PointerEvent or hit-testing: send a mouse event of the
  // pointer type, and say what lies under the pointer.
  function pointAt(root: HTMLElement, under: () => Element | null) {
    document.elementFromPoint = vi.fn(() => under());
    fireEvent(root, new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }));
  }

  async function renderIdlePlayer() {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine);
    return screen.getByRole("main");
  }

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("hides the cursor after three idle seconds and shows it again on movement", async () => {
    const root = await renderIdlePlayer();
    vi.useFakeTimers();
    pointAt(root, () => root);
    expect(root).not.toHaveClass("cursor-idle");
    act(() => vi.advanceTimersByTime(2_900));
    expect(root).not.toHaveClass("cursor-idle");
    act(() => vi.advanceTimersByTime(200));
    expect(root).toHaveClass("cursor-idle");

    pointAt(root, () => root);
    expect(root).not.toHaveClass("cursor-idle");
  });

  it("keeps the cursor while it rests on a control, then hides it once the control fades", async () => {
    const root = await renderIdlePlayer();
    const back = screen.getByRole("button", { name: "Back" });
    let under: Element = back;
    vi.useFakeTimers();
    pointAt(root, () => under);
    act(() => vi.advanceTimersByTime(10_000));
    expect(root).not.toHaveClass("cursor-idle");

    // The chrome fades and stops taking the pointer: the video is under it now.
    under = root;
    act(() => vi.advanceTimersByTime(3_000));
    expect(root).toHaveClass("cursor-idle");
  });
});

describe("System media controls", () => {
  async function renderWithMediaControls(gateway: SessionGateway, engine: FakePlayerEngine) {
    const watchers = new Set<(action: "stop") => void>();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionProvider createGateway={() => gateway}>
          <PlayerServicesProvider
            services={{
              engine,
              watchMediaControls: (onAction) => {
                watchers.add(onAction);
                return () => watchers.delete(onAction);
              },
            }}
          >
            <SignIn gateway={gateway} />
            <PlayerRouteView itemId="m1" mediaSourceId="src-hd" startTicks={0} />
          </PlayerServicesProvider>
        </SessionProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
    });
    return {
      watchers,
      stop: async () => {
        await act(async () => {
          for (const watcher of [...watchers]) watcher("stop");
        });
      },
    };
  }

  it("a Stop request stops the player, reports stopped, and returns to the detail view", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    const media = await renderWithMediaControls(gateway, engine);
    await startPlaying(engine);

    await media.stop();

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan(), snapshot, expect.any(AbortSignal), false);
  });

  it("a Stop request while the server is still negotiating leaves without launching", async () => {
    // Negotiation hangs until the player cancels it.
    const gateway = fakeGateway({
      createPlaybackPlan: vi.fn((_item, _ticks, signal: AbortSignal) => new Promise<PlaybackPlan>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })),
    });
    const engine = new FakePlayerEngine();
    const media = await renderWithMediaControls(gateway, engine);
    await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalled());
    expect(media.watchers.size).toBe(1);

    await media.stop();

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
    expect(engine.launch).not.toHaveBeenCalled();
    expect(gateway.reportStopped).not.toHaveBeenCalled();
  });
  it("says the item is gone for a 404, with Go home and no Retry", async () => {
    const gateway = fakeGateway({ itemDetail: vi.fn().mockRejectedValue(new ItemNotFoundError()) });
    await renderPlayer(gateway, new FakePlayerEngine());
    expect(await screen.findByRole("heading", { level: 1, name: "This item is no longer on the server" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "#/next/home");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("offers Retry when the item fails to load, and Retry asks again", async () => {
    const itemDetail = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(detail);
    await renderPlayer(fakeGateway({ itemDetail }), new FakePlayerEngine());
    expect(await screen.findByRole("heading", { level: 1, name: "Couldn't load this item" })).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await waitFor(() => expect(itemDetail).toHaveBeenCalledTimes(2));
  });

  it("hides addresses in a playback error and ignores player keys while the notice shows", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    engine.launch.mockRejectedValueOnce("failed to open https://media.test/x");
    await renderPlayer(gateway, engine);
    expect(await screen.findByText(/\[address\]/)).toBeInTheDocument();
    expect(screen.queryByText(/media\.test/)).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(engine.seek).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
  });

  it("shows a launch failure string without its token, address, or path", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    engine.launch.mockRejectedValueOnce(
      'mpv could not open https://media.test/Videos/x/stream?api_key=SECRET-TOKEN from /home/u/Movies/x.mkv (Token="SECRET-TOKEN")',
    );
    await renderPlayer(gateway, engine);
    const heading = await screen.findByRole("heading", { name: "Playback could not start" });
    const notice = heading.closest("section, div, [role]")?.parentElement ?? document.body;
    await waitFor(() => expect(notice.textContent).toContain("mpv could not open"));
    expect(notice.textContent).toContain("[address]");
    expect(notice.textContent).toContain("[path]");
    for (const leak of ["SECRET-TOKEN", "media.test", "api_key", "/home/u", "x.mkv"]) {
      expect(document.body.textContent).not.toContain(leak);
    }
  });

  it.each([
    ["string", "The player could not pause."],
    ["Error", new Error("The player could not pause.")],
  ])("shows a failed pause (%s) with the player's reason", async (_label, failure) => {
    const engine = new FakePlayerEngine();
    await renderPlayer(fakeGateway(), engine);
    await startPlaying(engine);
    engine.setPaused.mockRejectedValueOnce(failure);
    const toggle = await screen.findByRole("button", { name: /^(Play|Pause)$/ });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(engine.setPaused).toHaveBeenCalled();
    expect(await screen.findByText("The player could not pause.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Playback could not start" })).toBeInTheDocument();
  });

  it("reports a player that cannot start instead of launching, with the redacted reason", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    engine.initialize.mockRejectedValue("libmpv is missing (api_key=SECRET-TOKEN) /usr/lib/x86_64-linux-gnu/libEGL.so.1 file:///home/u/x");
    await renderPlayer(gateway, engine);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The player cannot start");
    expect(alert).toHaveTextContent("libmpv is missing");
    for (const leak of ["SECRET-TOKEN", "libEGL", "/home/u"]) expect(alert.textContent).not.toContain(leak);
    expect(engine.launch).not.toHaveBeenCalled();
    expect(gateway.createPlaybackPlan).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Back to details" })).toBeInTheDocument();
    expect(screen.getByText("Arrival")).toBeInTheDocument();
    expect(document.querySelector(".ui-notice")).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await waitFor(() => expect(engine.initialize).toHaveBeenCalledTimes(2));
  });

  it("shows player information while playing without the stream URL, session id, or token", async () => {
    const engine = new FakePlayerEngine();
    engine.initialize.mockResolvedValue({
      mode: "native",
      embedded: true,
      renderer: "OpenGL",
      nativeRenderer: "gl",
      libmpvVersion: "mpv 0.38.0",
    });
    await renderPlayer(fakeGateway(), engine);
    await startPlaying(engine);

    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    const panel = screen.getByRole("region", { name: "Player information" });
    expect(panel).toHaveTextContent("mpv 0.38.0");
    expect(panel).toHaveTextContent("Hardware");
    expect(panel).toHaveTextContent("Direct play");
    const text = panel.textContent ?? "";
    for (const secret of ["media.test", "play-1", "Token", "src-hd"]) expect(text).not.toContain(secret);
  });

  describe("Play original", () => {
    // The button lives in the Info sheet.
    async function openInfoThenPlayOriginal() {
      fireEvent.click(screen.getByRole("button", { name: "Info" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Play original" }));
      });
    }

    function limitedPlan(playSessionId: string, available: boolean): PlaybackPlan {
      return {
        ...plan(playSessionId),
        delivery: "hls",
        playMethod: "Transcode",
        conversionReasons: ["ContainerBitrateExceedsLimit"],
        serverUrl: "https://media.test",
        mediaKind: "videos",
        playOriginalAvailable: available,
      };
    }

    it("renegotiates once without the user's limit, then offers nothing more", async () => {
      const gateway = fakeGateway({
        createPlaybackPlan: vi.fn()
          .mockResolvedValueOnce(limitedPlan("play-1", true))
          .mockResolvedValueOnce(plan("play-2")),
      });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);

      await openInfoThenPlayOriginal();

      await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2"), expect.any(Function)));
      expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
      expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[0][4]).toEqual({ ignoreStreamingLimit: false });
      expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[1][4]).toEqual({ ignoreStreamingLimit: true });
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();
    });

    it("continues from the current position and says so when the server still converts", async () => {
      const gateway = fakeGateway({
        createPlaybackPlan: vi.fn()
          .mockResolvedValueOnce(limitedPlan("play-1", true))
          .mockResolvedValueOnce(limitedPlan("play-2", false)),
      });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine, 100_000_000);
      await startPlaying(engine);
      expect(screen.queryByText("The server still converts this.")).not.toBeInTheDocument();

      await openInfoThenPlayOriginal();

      await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2));
      // The snapshot is at 42 s.
      expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[1][1]).toBe(420_000_000);
      expect(await screen.findByText("The server still converts this.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();
    });

    it("stops the converting session's server encode before renegotiating", async () => {
      const order: string[] = [];
      const gateway = fakeGateway({
        createPlaybackPlan: vi.fn(async () => {
          order.push("negotiate");
          return order.length === 1 ? limitedPlan("play-1", true) : plan("play-2");
        }),
        stopActiveEncoding: vi.fn(async (playSessionId: string) => { order.push(`delete ${playSessionId}`); }),
      });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);

      await openInfoThenPlayOriginal();

      await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2"), expect.any(Function)));
      expect(order).toEqual(["negotiate", "delete play-1", "negotiate"]);
    });

    it("Back leaves a conversion without waiting for a failed stop or its DELETE", async () => {
      const gateway = fakeGateway({
        createPlaybackPlan: vi.fn().mockResolvedValue(limitedPlan("play-1", false)),
        reportStopped: vi.fn().mockRejectedValue(new Error("offline")),
        // A server that never answers.
        stopActiveEncoding: vi.fn(() => new Promise<void>(() => undefined)),
      });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
      });

      await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
      await waitFor(() => expect(gateway.stopActiveEncoding).toHaveBeenCalledWith("play-1", expect.any(AbortSignal)));
      expect(gateway.stopActiveEncoding).toHaveBeenCalledTimes(1);
    });

    it("is not shown when the limit is not the only reason", async () => {
      const gateway = fakeGateway({ createPlaybackPlan: vi.fn().mockResolvedValue(limitedPlan("play-1", false)) });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);
      fireEvent.click(screen.getByRole("button", { name: "Info" }));
      expect(screen.getByRole("region", { name: "Player information" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();
    });

    it("is not shown for direct play", async () => {
      const engine = new FakePlayerEngine();
      await renderPlayer(fakeGateway(), engine);
      await startPlaying(engine);
      fireEvent.click(screen.getByRole("button", { name: "Info" }));
      expect(screen.getByRole("region", { name: "Player information" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();
    });

    it("opens from the conversion chip with focus on the button", async () => {
      const gateway = fakeGateway({ createPlaybackPlan: vi.fn().mockResolvedValue(limitedPlan("play-1", true)) });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Converting on server/ }));

      expect(screen.getByRole("button", { name: "Play original" })).toHaveFocus();
    });

    it("applies to this session only: a new player view negotiates with the limit again", async () => {
      const gateway = fakeGateway({
        createPlaybackPlan: vi.fn()
          .mockResolvedValueOnce(limitedPlan("play-1", true))
          .mockResolvedValueOnce(plan("play-2"))
          .mockResolvedValueOnce(plan("play-3")),
      });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);
      await openInfoThenPlayOriginal();
      await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2"), expect.any(Function)));
      cleanup();

      const next = new FakePlayerEngine();
      await renderPlayer(gateway, next);
      await waitFor(() => expect(next.launch).toHaveBeenCalled());
      expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[2][4]).toEqual({ ignoreStreamingLimit: false });
    });
  });

  describe("conversion indicator", () => {
    const chipButton = () => screen.getByRole("button", { name: /Converting on server|Repackaging on server/ });

    function converted(playMethod: "DirectStream" | "Transcode", reasons: PlaybackPlan["conversionReasons"] & string[], burned = false): PlaybackPlan {
      return {
        ...plan(),
        delivery: "hls",
        playMethod,
        conversionReasons: reasons as never,
        serverUrl: "https://media.test",
        mediaKind: "videos",
        subtitlesBurnedIn: burned,
      } as PlaybackPlan;
    }

    it("shows nothing for direct play", async () => {
      const engine = new FakePlayerEngine();
      await renderPlayer(fakeGateway(), engine);
      await startPlaying(engine);
      // No chip, no conversion line, and Info says Original file.
      expect(screen.queryByRole("button", { name: /Converting|Repackaging/ })).not.toBeInTheDocument();
      expect(screen.getByRole("status", { name: "Player message" })).toBeEmptyDOMElement();
      fireEvent.click(screen.getByRole("button", { name: "Info" }));
      expect(screen.getByRole("region", { name: "Player information" })).toHaveTextContent("Original file");
    });

    it("says the server is converting, with the reason and burned-in subtitles", async () => {
      const engine = new FakePlayerEngine();
      await renderPlayer(fakeGateway({
        createPlaybackPlan: vi.fn().mockResolvedValue(converted("Transcode", ["ContainerBitrateExceedsLimit"], true)),
      }), engine);
      await startPlaying(engine);
      const chip = screen.getByRole("button", { name: /Converting on server/ });
      expect(chip).toHaveTextContent("Converting on server: the file is over your streaming limit");
      expect(chip).toHaveTextContent("Subtitles are burned in");
      expect(screen.getByRole("status", { name: "Player message" })).toHaveTextContent("Subtitles are burned in");
      fireEvent.click(screen.getByRole("button", { name: "Info" }));
      expect(screen.getByRole("region", { name: "Player information" })).toHaveTextContent("the file is over your streaming limit");
    });

    describe("server confirmation", () => {
      beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it("switches to original quality only when the server says it copies", async () => {
        const engine = new FakePlayerEngine();
        const gateway = fakeGateway({
          createPlaybackPlan: vi.fn().mockResolvedValue(converted("Transcode", [])),
          sessionPlayMethod: vi.fn().mockResolvedValue({ playMethod: "Transcode", videoDirect: true, audioDirect: true, reasons: ["DirectPlayError"] }),
        });
        await renderPlayer(gateway, engine);
        await startPlaying(engine);
        expect(chipButton()).toHaveTextContent("Converting on server: the server needs to convert this file");
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3_000);
        });
        await waitFor(() => expect(chipButton()).toHaveTextContent(
          "Repackaging on server, original quality: playing the original file failed",
        ));
        expect(screen.getByRole("status", { name: "Player message" })).toHaveTextContent(
          "Repackaging on server, original quality: playing the original file failed",
        );
        fireEvent.click(screen.getByRole("button", { name: "Info" }));
        expect(screen.getByRole("region", { name: "Player information" })).toHaveTextContent("Direct stream");
        expect(gateway.sessionPlayMethod).toHaveBeenCalledWith(expect.objectContaining({ itemId: "m1" }), expect.any(AbortSignal));
      });

      it("keeps Converting when the server cannot be asked", async () => {
        const engine = new FakePlayerEngine();
        const gateway = fakeGateway({
          createPlaybackPlan: vi.fn().mockResolvedValue(converted("Transcode", ["DirectPlayError"])),
          sessionPlayMethod: vi.fn().mockRejectedValue(new Error("offline")),
        });
        await renderPlayer(gateway, engine);
        await startPlaying(engine);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(11_000);
        });
        expect(gateway.sessionPlayMethod).toHaveBeenCalledTimes(2);
        expect(chipButton()).toHaveTextContent("Converting on server: playing the original file failed");
      });
    });

    it("says the server is repackaging at original quality", async () => {
      const engine = new FakePlayerEngine();
      await renderPlayer(fakeGateway({
        createPlaybackPlan: vi.fn().mockResolvedValue(converted("DirectStream", ["ContainerNotSupported"])),
      }), engine);
      await startPlaying(engine);
      expect(chipButton()).toHaveTextContent(
        "Repackaging on server, original quality: the file format is not supported here",
      );
      expect(screen.queryByText("Subtitles are burned in")).not.toBeInTheDocument();
    });
  });

  it("names a converted plan's play method in player information", async () => {
    const engine = new FakePlayerEngine();
    const converted: PlaybackPlan = {
      ...plan(),
      streamUrl: "https://media.test/videos/m1/master.m3u8?MediaSourceId=src-hd&EnableTrickplay=false",
      delivery: "hls",
      playMethod: "Transcode",
      conversionReasons: ["ContainerBitrateExceedsLimit"],
      serverUrl: "https://media.test",
      mediaKind: "videos",
    };
    await renderPlayer(fakeGateway({ createPlaybackPlan: vi.fn().mockResolvedValue(converted) }), engine);
    await startPlaying(engine);
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.getByRole("region", { name: "Player information" })).toHaveTextContent("Transcode");
  });
});
