import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider, type PlayerServices } from "../../app/player-services";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail, NextEpisode } from "../../domain/catalog";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { parsePlayRoute } from "../routes";
import { PlayerRouteView } from "./index";

function episode(id: string, title: string): ItemDetail {
  return {
    id,
    type: "Episode",
    title,
    seriesId: "s1",
    seriesName: "Show",
    genres: [],
    cast: [],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions: [],
  };
}

const movie: ItemDetail = { ...episode("m1", "Arrival"), type: "Movie", seriesId: undefined };
const second: NextEpisode = { id: "e2", title: "Second", label: "S1 · E2" };

function plan(itemId: string, playSessionId: string): PlaybackPlan {
  return {
    itemId,
    title: itemId,
    streamUrl: `https://media.test/Videos/${itemId}/stream?Static=true`,
    mediaSourceId: "src",
    authorization: 'MediaBrowser Token="test"',
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
  };
}

function snapshotAt(positionSeconds: number): PlaybackSnapshot {
  return {
    positionSeconds,
    durationSeconds: 1200,
    paused: false,
    buffering: false,
    volume: 100,
    muted: false,
    tracks: [],
    diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
  };
}

function fakeGateway(
  details: ItemDetail[],
  next: NextEpisode | undefined,
  overrides: Partial<SessionGateway> = {},
): SessionGateway {
  const sessions = new Map<string, number>();
  return fakeSessionGateway({
    itemDetail: vi.fn(async (id: string) => details.find((detail) => detail.id === id)!),
    nextEpisode: vi.fn().mockResolvedValue(next),
    createPlaybackPlan: vi.fn(async (item: LibraryItem) => {
      const count = (sessions.get(item.id) ?? 0) + 1;
      sessions.set(item.id, count);
      return plan(item.id, `play-${item.id}-${count}`);
    }),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

// Follows the hash like the app's router does, remounting per route. It only
// mounts once signed in, as the app's routes do.
function Router() {
  const { gateway } = useSession();
  return gateway ? <Routes /> : null;
}

function Routes() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const route = parsePlayRoute(hash);
  return route ? <PlayerRouteView key={hash} {...route} /> : <p>{hash}</p>;
}

async function renderPlayer(gateway: SessionGateway, engine: FakePlayerEngine, services: Partial<PlayerServices> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionProvider createGateway={() => gateway}>
        <PlayerServicesProvider services={{ engine, ...services }}>
          <SignIn gateway={gateway} />
          <Router />
        </PlayerServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

async function loadedAt(engine: FakePlayerEngine, position: number, launches = 1) {
  await waitFor(() => expect(engine.launch).toHaveBeenCalledTimes(launches));
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot: snapshotAt(position) });
    engine.emit({ kind: "first-frame" });
  });
}

async function moveTo(engine: FakePlayerEngine, position: number) {
  await act(async () => {
    engine.emit({ kind: "state", snapshot: snapshotAt(position), cause: "seek" });
  });
}

beforeEach(() => {
  window.location.hash = "#/next/play/e1";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Auto-play the next episode", () => {
  it("shows the countdown near the end and hides it when the viewer seeks back out", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 100);
    await waitFor(() => expect(gateway.nextEpisode).toHaveBeenCalledWith("s1", "e1", expect.any(AbortSignal)));
    expect(screen.queryByLabelText("Up next")).not.toBeInTheDocument();

    await moveTo(engine, 1175);
    const card = await screen.findByLabelText("Up next");
    expect(card).toHaveTextContent("Up next · S1 · E2");
    expect(card).toHaveTextContent("Second");
    expect(within(screen.getByRole("complementary", { name: "Up next" })).getByRole("status")).toHaveTextContent("Up next: Second, playing in 10 seconds");

    await moveTo(engine, 600);
    expect(screen.queryByLabelText("Up next")).not.toBeInTheDocument();
  });

  it("starts at the Outro when the server marks credits", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot")], second, {
      createPlaybackPlan: vi.fn(async (item: LibraryItem) => ({ ...plan(item.id, "play-e1-1"), hasSegments: true })),
      mediaSegments: vi.fn().mockResolvedValue([{ kind: "Outro", startSeconds: 1000, endSeconds: 1200 }]),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 500);
    await waitFor(() => expect(gateway.mediaSegments).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByLabelText("Up next")).not.toBeInTheDocument();

    await moveTo(engine, 1000);
    expect(await screen.findByLabelText("Up next")).toBeInTheDocument();
  });

  it("Play now stops this session and negotiates a fresh one for the next episode", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Play now" }));
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/play/e2"));
    expect(gateway.reportStopped).toHaveBeenCalledWith(
      plan("e1", "play-e1-1"),
      expect.objectContaining({ positionSeconds: 1175 }),
      expect.any(AbortSignal),
      false,
    );
    await loadedAt(engine, 0, 2);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    expect(gateway.createPlaybackPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "e2", type: "Episode" }),
      0,
      expect.any(AbortSignal),
      undefined,
      { ignoreStreamingLimit: false },
    );
    expect(engine.launch).toHaveBeenLastCalledWith(plan("e2", "play-e2-1"));
    const reportStopped = vi.mocked(gateway.reportStopped).mock.invocationCallOrder[0];
    const secondNegotiation = vi.mocked(gateway.createPlaybackPlan).mock.invocationCallOrder[1];
    expect(reportStopped).toBeLessThan(secondNegotiation);
  });

  it("Hide keeps playing, never advances, and the end of the file returns to the series", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot")], second, { setPlayed: vi.fn().mockResolvedValue(undefined) });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Hide" }));
    });

    expect(screen.queryByLabelText("Up next")).not.toBeInTheDocument();
    expect(engine.stop).not.toHaveBeenCalled();
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/next/play/e1");

    // Seeking out of and back into the end window does not bring the card back.
    await moveTo(engine, 600);
    await moveTo(engine, 1180);
    expect(screen.queryByLabelText("Up next")).not.toBeInTheDocument();

    await act(async () => {
      engine.emit({ kind: "ended", reason: "eof", snapshot: snapshotAt(1200) });
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/series/s1"));
    expect(gateway.reportStopped).toHaveBeenCalledWith(
      plan("e1", "play-e1-1"),
      expect.anything(),
      expect.any(AbortSignal),
      false,
    );
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
    expect(gateway.setPlayed).not.toHaveBeenCalled();
  });

  it("n plays the next episode like Play now", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);
    await screen.findByLabelText("Up next");

    await act(async () => {
      fireEvent.keyDown(window, { key: "n" });
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/play/e2"));
    expect(engine.stop).toHaveBeenCalledTimes(1);
  });

  it("n does nothing before the card shows", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 100);
    await act(async () => undefined);

    await act(async () => {
      fireEvent.keyDown(window, { key: "n" });
    });

    expect(window.location.hash).toBe("#/next/play/e1");
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it("speaks at most twice over a full countdown", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      engine.emit({ kind: "loaded", snapshot: snapshotAt(1175) });
      engine.emit({ kind: "first-frame" });
      await vi.advanceTimersByTimeAsync(0);
    });
    const spoken = new Set<string>();
    for (let tick = 0; tick < 10; tick += 1) {
      const status = within(screen.getByRole("complementary", { name: "Up next" })).getByRole("status");
      if (status.textContent) spoken.add(status.textContent);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect([...spoken]).toEqual([
      "Up next: Second, playing in 10 seconds",
      "Up next: Second, playing in 5 seconds",
    ]);
  });

  it("offers no Skip credits while a next episode exists, before or after Hide", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot")], second, {
      createPlaybackPlan: vi.fn(async (item: LibraryItem) => ({ ...plan(item.id, "play-e1-1"), hasSegments: true })),
      mediaSegments: vi.fn().mockResolvedValue([
        { kind: "Intro", startSeconds: 10, endSeconds: 70 },
        { kind: "Outro", startSeconds: 1000, endSeconds: 1200 },
      ]),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 30);
    await waitFor(() => expect(gateway.mediaSegments).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Skip intro" })).toBeInTheDocument();

    await moveTo(engine, 1010);
    expect(await screen.findByLabelText("Up next")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip credits" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    });
    expect(screen.queryByRole("button", { name: "Skip credits" })).not.toBeInTheDocument();
  });

  it("goes straight to the next episode when the file ends", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 100);
    await waitFor(() => expect(gateway.nextEpisode).toHaveBeenCalled());
    // Let the lookup settle before the file ends.
    await act(async () => undefined);

    await act(async () => {
      engine.emit({ kind: "ended", reason: "eof", snapshot: snapshotAt(1200) });
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/play/e2"));
    expect(gateway.reportStopped).toHaveBeenCalledTimes(1);
  });

  it("shows no card and returns to the item at the end of the last episode", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot")], undefined);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);
    await waitFor(() => expect(gateway.nextEpisode).toHaveBeenCalled());

    expect(screen.queryByLabelText("Up next")).not.toBeInTheDocument();
    await act(async () => {
      engine.emit({ kind: "ended", reason: "eof", snapshot: snapshotAt(1200) });
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/e1"));
  });

  it("does not look for a next episode for a movie", async () => {
    window.location.hash = "#/next/play/m1";
    const gateway = fakeGateway([movie], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);

    expect(gateway.nextEpisode).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Up next")).not.toBeInTheDocument();
  });

  it("advances by itself when the countdown reaches zero, and holds while paused", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(engine.launch).toHaveBeenCalledTimes(1);
    await act(async () => {
      engine.emit({ kind: "loaded", snapshot: snapshotAt(1175) });
      engine.emit({ kind: "first-frame" });
      await vi.advanceTimersByTimeAsync(0);
    });
    const status = () => within(screen.getByRole("complementary", { name: "Up next" })).getByRole("status");
    const countdown = () => screen.getByLabelText("Up next").querySelector(".up-next-countdown");
    expect(status()).toHaveTextContent("Up next: Second, playing in 10 seconds");
    expect(countdown()).toHaveTextContent("Playing in 10 seconds");

    for (let second = 0; second < 4; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(countdown()).toHaveTextContent("Playing in 6 seconds");
    // The spoken text did not change with the seconds.
    expect(status()).toHaveTextContent("Up next: Second, playing in 10 seconds");

    await act(async () => {
      engine.emit({ kind: "state", snapshot: { ...snapshotAt(1179), paused: true }, cause: "pause" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(countdown()).toHaveTextContent("Playing in 6 seconds");
    expect(window.location.hash).toBe("#/next/play/e1");

    await act(async () => {
      engine.emit({ kind: "state", snapshot: snapshotAt(1179), cause: "pause" });
    });
    for (let second = 0; second < 6; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(window.location.hash).toBe("#/next/play/e2");
    expect(gateway.reportStopped).toHaveBeenCalledTimes(1);
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Signs in and loads the first episode at `position` under fake timeouts.
async function startWithFakeTimers(gateway: SessionGateway, engine: FakePlayerEngine, position: number) {
  await renderPlayer(gateway, engine);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(engine.launch).toHaveBeenCalledTimes(1);
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot: snapshotAt(position) });
    engine.emit({ kind: "first-frame" });
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("Auto-play hardening", () => {
  it("does not advance after a playback error, even one that arrives mid-countdown", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      engine.emit({ kind: "loaded", snapshot: snapshotAt(1175) });
      engine.emit({ kind: "first-frame" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Up next")).toBeInTheDocument();

    await act(async () => {
      engine.emit({ kind: "error", message: "decoder hiccup" });
    });
    expect(screen.queryByLabelText("Up next")).not.toBeInTheDocument();
    for (let second = 0; second < 15; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(window.location.hash).toBe("#/next/play/e1");

    await act(async () => {
      engine.emit({ kind: "ended", reason: "error", snapshot: snapshotAt(1176) });
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(window.location.hash).toBe("#/next/play/e1");
    expect(gateway.setPlayed).not.toHaveBeenCalled();
  });

  it("lets an explicit Back win over a natural end whose engine stop is still running", async () => {
    const engineStopped = deferred();
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 100);
    await waitFor(() => expect(gateway.nextEpisode).toHaveBeenCalled());
    await act(async () => undefined);
    engine.stop.mockImplementationOnce(() => engineStopped.promise.then(() => undefined));

    await act(async () => {
      engine.emit({ kind: "ended", reason: "eof", snapshot: snapshotAt(1200) });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    });
    expect(window.location.hash).toBe("#/next/play/e1");
    await act(async () => {
      engineStopped.resolve();
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/e1"));
    expect(gateway.setPlayed).not.toHaveBeenCalled();
  });

  it("leaves for the next episode at once with a slow progress report, and negotiates it only after the old Stopped report", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second, {
      reportProgress: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const engine = new FakePlayerEngine();
    await startWithFakeTimers(gateway, engine, 1175);
    await act(async () => {
      engine.emit({ kind: "state", snapshot: snapshotAt(1176), cause: "seek" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(gateway.reportProgress).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play now" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(window.location.hash).toBe("#/next/play/e2");
    expect(gateway.reportStopped).not.toHaveBeenCalled();
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_900);
    });
    expect(gateway.reportStopped).not.toHaveBeenCalled();
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(gateway.reportStopped).toHaveBeenCalledTimes(1);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    const stoppedAt = vi.mocked(gateway.reportStopped).mock.invocationCallOrder[0];
    const negotiatedAt = vi.mocked(gateway.createPlaybackPlan).mock.invocationCallOrder[1];
    expect(negotiatedAt).toBeGreaterThan(stoppedAt);
  });

  it("marks the episode played when advancing, after its Stopped report, but not on Hide", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second, {
      setPlayed: vi.fn().mockResolvedValue(undefined),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Play now" }));
    });
    await waitFor(() => expect(gateway.setPlayed).toHaveBeenCalledWith("e1", true));
    expect(vi.mocked(gateway.setPlayed).mock.invocationCallOrder[0])
      .toBeGreaterThan(vi.mocked(gateway.reportStopped).mock.invocationCallOrder[0]);

    cleanup();
    window.location.hash = "#/next/play/e1";
    const other = fakeGateway([episode("e1", "Pilot")], second, { setPlayed: vi.fn().mockResolvedValue(undefined) });
    const otherEngine = new FakePlayerEngine();
    await renderPlayer(other, otherEngine);
    await loadedAt(otherEngine, 1175);
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Hide" }));
    });
    await act(async () => {
      otherEngine.emit({ kind: "ended", reason: "eof", snapshot: snapshotAt(1200) });
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/series/s1"));
    expect(other.setPlayed).not.toHaveBeenCalled();
  });
});

describe("Leaving does not wait for playstate reports", () => {
  it("Back leaves at once while a progress report hangs, and the Stopped report still goes out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = fakeGateway([episode("e1", "Pilot")], undefined, {
      reportProgress: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const engine = new FakePlayerEngine();
    await startWithFakeTimers(gateway, engine, 100);
    await act(async () => {
      engine.emit({ kind: "state", snapshot: snapshotAt(200), cause: "seek" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(gateway.reportProgress).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(window.location.hash).toBe("#/next/item/e1");
    expect(gateway.reportStopped).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(gateway.reportStopped).toHaveBeenCalledTimes(1);
    expect(gateway.reportStopped).toHaveBeenCalledWith(
      plan("e1", "play-e1-1"),
      expect.objectContaining({ positionSeconds: 200 }),
      expect.any(AbortSignal),
      false,
    );
  });

  it("a natural end leaves at once, then negotiates and marks played after the Stopped report", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second, {
      reportProgress: vi.fn(() => new Promise<void>(() => undefined)),
      setPlayed: vi.fn().mockResolvedValue(undefined),
    });
    const engine = new FakePlayerEngine();
    await startWithFakeTimers(gateway, engine, 100);
    expect(gateway.nextEpisode).toHaveBeenCalled();
    await act(async () => {
      engine.emit({ kind: "state", snapshot: snapshotAt(200), cause: "seek" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(gateway.reportProgress).toHaveBeenCalled();

    await act(async () => {
      engine.emit({ kind: "ended", reason: "eof", snapshot: snapshotAt(1200) });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(window.location.hash).toBe("#/next/play/e2");
    expect(gateway.reportStopped).not.toHaveBeenCalled();
    expect(gateway.setPlayed).not.toHaveBeenCalled();
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(gateway.reportStopped).toHaveBeenCalledTimes(1);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    expect(gateway.setPlayed).toHaveBeenCalledWith("e1", true);
    const stoppedAt = vi.mocked(gateway.reportStopped).mock.invocationCallOrder[0];
    expect(vi.mocked(gateway.createPlaybackPlan).mock.invocationCallOrder[1]).toBeGreaterThan(stoppedAt);
    expect(vi.mocked(gateway.setPlayed).mock.invocationCallOrder[0]).toBeGreaterThan(stoppedAt);
  });

  it("stops the engine once however often Back and Play now are pressed during the stop", async () => {
    const engineStopped = deferred();
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);
    const playNow = await screen.findByRole("button", { name: "Play now" });
    engine.stop.mockImplementationOnce(() => engineStopped.promise.then(() => undefined));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      fireEvent.click(playNow);
    });
    expect(engine.stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      engineStopped.resolve();
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/e1"));
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(gateway.setPlayed).not.toHaveBeenCalled();
  });

  it("a system Stop during the countdown's own stop wins like Back and reuses that stop", async () => {
    const engineStopped = deferred();
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    let mediaStop: (() => void) | undefined;
    await renderPlayer(gateway, engine, {
      watchMediaControls: (onAction) => {
        mediaStop = () => onAction("stop");
        return () => {
          mediaStop = undefined;
        };
      },
    });
    await loadedAt(engine, 1175);
    const playNow = await screen.findByRole("button", { name: "Play now" });
    engine.stop.mockImplementationOnce(() => engineStopped.promise.then(() => undefined));

    await act(async () => {
      fireEvent.click(playNow);
    });
    await act(async () => {
      mediaStop?.();
    });
    expect(engine.stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      engineStopped.resolve();
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/e1"));
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(gateway.setPlayed).not.toHaveBeenCalled();
  });

  it("stays on the player and forgets every pending destination when the stop fails", async () => {
    const engineStopped = deferred();
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);
    const playNow = await screen.findByRole("button", { name: "Play now" });
    engine.stop.mockImplementationOnce(() => engineStopped.promise.then(() => {
      throw new Error("The player did not stop.");
    }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      fireEvent.click(playNow);
    });
    await act(async () => {
      engineStopped.resolve();
    });
    expect(await screen.findByText(/The player did not stop/)).toBeInTheDocument();
    expect(window.location.hash).toBe("#/next/play/e1");
    expect(engine.stop).toHaveBeenCalledTimes(1);

    // The error panel repeats Back as "Back to library"; either one leaves.
    const backButtons = screen.getAllByRole("button", { name: /^Back( to library)?$/ });
    expect(backButtons.map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["Back", "Back to library"]);
    await act(async () => {
      fireEvent.click(backButtons[0]);
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/item/e1"));
    expect(engine.stop).toHaveBeenCalledTimes(2);
  });
});
