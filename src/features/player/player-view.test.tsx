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
    const back = screen.getByRole("button", { name: "Back to library" });
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
    expect(screen.getByRole("link", { name: "Back to details" })).toBeInTheDocument();
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
    function limitedPlan(playSessionId: string, available: boolean): PlaybackPlan {
      return {
        ...plan(playSessionId),
        delivery: "hls",
        playMethod: "Transcode",
        conversionReasons: ["ContainerBitrateExceedsLimit"],
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

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Play original" }));
      });

      await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2")));
      expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
      expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[0][4]).toEqual({ ignoreStreamingLimit: false });
      expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[1][4]).toEqual({ ignoreStreamingLimit: true });
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();
    });

    it("is not shown when the limit is not the only reason", async () => {
      const gateway = fakeGateway({ createPlaybackPlan: vi.fn().mockResolvedValue(limitedPlan("play-1", false)) });
      const engine = new FakePlayerEngine();
      await renderPlayer(gateway, engine);
      await startPlaying(engine);
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();
    });

    it("is not shown for direct play", async () => {
      const engine = new FakePlayerEngine();
      await renderPlayer(fakeGateway(), engine);
      await startPlaying(engine);
      expect(screen.queryByRole("button", { name: "Play original" })).not.toBeInTheDocument();
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
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Play original" }));
      });
      await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(plan("play-2")));
      cleanup();

      const next = new FakePlayerEngine();
      await renderPlayer(gateway, next);
      await waitFor(() => expect(next.launch).toHaveBeenCalled());
      expect(vi.mocked(gateway.createPlaybackPlan).mock.calls[2][4]).toEqual({ ignoreStreamingLimit: false });
    });
  });
});
