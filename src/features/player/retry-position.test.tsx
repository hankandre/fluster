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

const detail: ItemDetail = {
  id: "m1",
  type: "Movie",
  title: "Arrival",
  genres: [],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};

function plan(playSessionId: string): PlaybackPlan {
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

function at(positionSeconds: number): PlaybackSnapshot {
  return {
    positionSeconds,
    durationSeconds: 7200,
    paused: false,
    buffering: false,
    volume: 100,
    muted: false,
    tracks: [],
    diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
  };
}

function fakeGateway(): SessionGateway {
  return fakeSessionGateway({
    itemDetail: vi.fn().mockResolvedValue(detail),
    createPlaybackPlan: vi.fn()
      .mockResolvedValueOnce(plan("play-1"))
      .mockResolvedValueOnce(plan("play-2")),
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderPlayer(gateway: SessionGateway, engine: FakePlayerEngine, startTicks: number) {
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
}

async function failMidPlay(engine: FakePlayerEngine, last: Extract<Parameters<FakePlayerEngine["emit"]>[0], { kind: "state" }>) {
  await waitFor(() => expect(engine.launch).toHaveBeenCalled());
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot: at(0) });
    engine.emit({ kind: "first-frame" });
    engine.emit({ kind: "state", snapshot: at(1500), cause: "property" });
    engine.emit(last);
    engine.emit({ kind: "error", message: "Decoder failed" });
    engine.emit({ kind: "ended", reason: "error", snapshot: last.snapshot });
  });
  expect(await screen.findByRole("heading", { name: "Playback could not start" })).toBeInTheDocument();
}

async function retry(gateway: SessionGateway) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  });
  await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2));
  return vi.mocked(gateway.createPlaybackPlan).mock.calls;
}

beforeEach(() => {
  window.location.hash = "#/next/play/m1?source=src-hd";
});

afterEach(cleanup);

describe("Retry position (P3-30)", () => {
  it("keeps the resume position when launch fails before any frame", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    engine.launch.mockRejectedValueOnce(new Error("The video surface is not ready."));
    await renderPlayer(gateway, engine, 600_000_000);
    expect(await screen.findByRole("heading", { name: "Playback could not start" })).toBeInTheDocument();

    const calls = await retry(gateway);

    expect(calls[1]?.[1]).toBe(600_000_000);
    expect(calls[1]?.[0]).toEqual(calls[0]?.[0]);
    expect(calls[1]?.[3]).toBe(calls[0]?.[3]);
    expect(calls[1]?.[4]).toEqual(calls[0]?.[4]);
  });

  it("retries from the last reported position after a mid-play failure", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, 0);
    await failMidPlay(engine, { kind: "state", snapshot: at(1500), cause: "property" });

    const calls = await retry(gateway);

    expect(calls[1]?.[1]).toBe(15_000_000_000);
    expect(calls[1]?.[0]).toEqual(calls[0]?.[0]);
    expect(calls[1]?.[3]).toBe(calls[0]?.[3]);
    expect(calls[1]?.[4]).toEqual({ ignoreStreamingLimit: false });
  });

  it("retries from where the viewer seeked", async () => {
    const gateway = fakeGateway();
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, 0);
    await failMidPlay(engine, { kind: "state", snapshot: at(90), cause: "seek" });

    const calls = await retry(gateway);

    expect(calls[1]?.[1]).toBe(900_000_000);
  });
});
