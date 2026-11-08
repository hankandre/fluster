import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
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
const second: NextEpisode = { id: "e2", title: "Second", label: "S1E2" };

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

async function renderPlayer(gateway: SessionGateway, engine: FakePlayerEngine) {
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
    expect(await screen.findByLabelText("Up next")).toHaveTextContent("Up next S1E2 Second");
    expect(screen.getByRole("status")).toHaveTextContent("Playing in 10 s");

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
    );
    expect(engine.launch).toHaveBeenLastCalledWith(plan("e2", "play-e2-1"));
    const reportStopped = vi.mocked(gateway.reportStopped).mock.invocationCallOrder[0];
    const secondNegotiation = vi.mocked(gateway.createPlaybackPlan).mock.invocationCallOrder[1];
    expect(reportStopped).toBeLessThan(secondNegotiation);
  });

  it("Cancel stops playback and returns to the series", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/series/s1"));
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(gateway.reportStopped).toHaveBeenCalledWith(
      plan("e1", "play-e1-1"),
      expect.anything(),
      expect.any(AbortSignal),
      false,
    );
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole("status")).toHaveTextContent("Playing in 10 s");

    for (let second = 0; second < 4; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(screen.getByRole("status")).toHaveTextContent("Playing in 6 s");

    await act(async () => {
      engine.emit({ kind: "state", snapshot: { ...snapshotAt(1179), paused: true }, cause: "pause" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Playing in 6 s");
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
