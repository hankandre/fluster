import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesProvider } from "../../app/preferences";
import { PlayerServicesProvider, type PlayerServices } from "../../app/player-services";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail, NextEpisode } from "../../domain/catalog";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { autoPlayOf, continueWindowOf, MemoryPreferenceStore, type AutoPlayPreference } from "../../lib/preference-store";
import { MemoryStreamingLimits } from "../../lib/streaming-limits";
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

const second: NextEpisode = { id: "e2", title: "Second", label: "S1 · E2" };

function plan(itemId: string, playSessionId: string): PlaybackPlan {
  return {
    itemId,
    title: itemId,
    streamUrl: `https://media.test/Videos/${itemId}/stream?Static=true`,
    mediaSourceId: "src",
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

async function renderPlayer(gateway: SessionGateway, engine: FakePlayerEngine, autoPlay?: AutoPlayPreference, services: Partial<PlayerServices> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = new MemoryPreferenceStore();
  if (autoPlay) store.update("autoPlay", autoPlay);
  const tree = (
    <QueryClientProvider client={client}>
      <SessionProvider createGateway={() => gateway}>
        <PlayerServicesProvider services={{ engine, ...services }}>
          <SignIn gateway={gateway} />
          <Router />
        </PlayerServicesProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
  render(
    autoPlay ? (
      <PreferencesProvider preferences={{ streamingLimits: new MemoryStreamingLimits(), continueWindow: continueWindowOf(store), autoPlay: autoPlayOf(store) }}>
        {tree}
      </PreferencesProvider>
    ) : tree,
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

beforeEach(() => {
  window.location.hash = "#/next/play/e1";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const OFF: AutoPlayPreference = { enabled: false, countdownSeconds: 10 };

async function tickPlayer(engine: FakePlayerEngine, position: number) {
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot: snapshotAt(position) });
    engine.emit({ kind: "first-frame" });
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("Auto-play settings", () => {
  it.each([5, 15] as const)("a %i second countdown names its length and advances after that many ticks", async (seconds) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, { enabled: true, countdownSeconds: seconds });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await tickPlayer(engine, 1180);
    const card = screen.getByRole("complementary", { name: "Up next" });
    expect(card).toHaveTextContent(`Playing in ${seconds} seconds`);
    expect(within(card).getByRole("status")).toHaveTextContent(`Up next: Second, playing in ${seconds} seconds`);

    const spoken = new Set<string>();
    for (let tick = 0; tick < seconds - 1; tick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      spoken.add(within(screen.getByRole("complementary", { name: "Up next" })).getByRole("status").textContent ?? "");
    }
    expect(window.location.hash).toBe("#/next/play/e1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(window.location.hash).toBe("#/next/play/e2");
    expect(spoken.size).toBe(seconds === 5 ? 1 : 2);
  });

  it("with auto-play off the card offers Play now and Hide and nothing counts or advances", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, OFF);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await tickPlayer(engine, 1180);
    const card = screen.getByRole("complementary", { name: "Up next" });
    expect(within(card).getByRole("button", { name: "Play now" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Hide" })).toBeInTheDocument();
    expect(card.querySelector(".up-next-fill")).toBeNull();
    expect(card.querySelector(".up-next-countdown")).toBeNull();
    expect(within(card).getByRole("status")).toHaveTextContent("Up next: Second");
    expect(within(card).getByRole("status")).not.toHaveTextContent("playing in");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(window.location.hash).toBe("#/next/play/e1");
    expect(engine.stop).not.toHaveBeenCalled();
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
  });

  it("with auto-play off the end of the file goes to the series page", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot")], second, { setPlayed: vi.fn().mockResolvedValue(undefined) });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, OFF);
    await loadedAt(engine, 1175);
    await screen.findByLabelText("Up next");
    await act(async () => {
      engine.emit({ kind: "ended", reason: "eof", snapshot: snapshotAt(1200) });
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/series/s1"));
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
    expect(gateway.setPlayed).not.toHaveBeenCalled();
  });

  it("with auto-play off n and Play now start the next episode, and Skip credits is not offered", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot"), episode("e2", "Second")], second, {
      createPlaybackPlan: vi.fn(async (item: LibraryItem) => ({ ...plan(item.id, `play-${item.id}-1`), hasSegments: true })),
      mediaSegments: vi.fn().mockResolvedValue([{ kind: "Outro", startSeconds: 1000, endSeconds: 1200 }]),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, OFF);
    await loadedAt(engine, 1010);
    await screen.findByLabelText("Up next");
    expect(screen.queryByRole("button", { name: "Skip credits" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(window, { key: "n" });
    });
    await waitFor(() => expect(window.location.hash).toBe("#/next/play/e2"));
  });

  it("without a provider the default applies: on, 10 seconds", async () => {
    const gateway = fakeGateway([episode("e1", "Pilot")], second);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await loadedAt(engine, 1175);
    expect(await screen.findByLabelText("Up next")).toHaveTextContent("Playing in 10 seconds");
  });
});
