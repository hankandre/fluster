import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import type { PlaybackPlan } from "../../domain/playback";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { PlayerRouteView } from "./index";

// P17-08: the play route's audio pick reaches Playback Negotiation; with no pick, nothing is added.
const detail: ItemDetail = {
  id: "m1",
  type: "Movie",
  title: "Arrival",
  genres: [],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};

const plan: PlaybackPlan = {
  itemId: "m1",
  title: "Arrival",
  streamUrl: "https://media.test/Videos/m1/stream?Static=true",
  mediaSourceId: "src-hd",
  playSessionId: "play-1",
  startPositionTicks: 0,
  tracks: [],
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderPlayer(audioStreamIndex: number | undefined) {
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
          <PlayerRouteView itemId="m1" mediaSourceId="src-hd" startTicks={0} audioStreamIndex={audioStreamIndex} />
        </PlayerServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
  await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalled());
  return { gateway, engine };
}

beforeEach(() => {
  window.location.hash = "#/next/play/m1?source=src-hd";
});

afterEach(cleanup);

describe("Audio pick in the player route (P17-08)", () => {
  it("with no pick, the negotiation gets exactly today's options", async () => {
    const { gateway } = await renderPlayer(undefined);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledWith(expect.anything(), 0, expect.any(AbortSignal), "src-hd", { ignoreStreamingLimit: false });
  });

  it("with a pick, the index and the keep-direct-play flag reach the negotiation", async () => {
    const { gateway } = await renderPlayer(2);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledWith(expect.anything(), 0, expect.any(AbortSignal), "src-hd", {
      ignoreStreamingLimit: false,
      audioStreamIndex: 2,
      keepDirectPlay: true,
    });
  });
});
