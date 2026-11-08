import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlayerServices, type PlayerServices } from "../../app/player-services";
import { useSession, type SessionGateway } from "../../app/session";
import { PlayerView } from "../../components/PlayerView";
import type { ItemDetail } from "../../domain/catalog";
import { detailKey } from "../detail/detail-key";
import { refreshHomeRows } from "../home";
import { itemRoute, leavePlayer, type PlayRoute } from "../routes";
import { toPlayableItem } from "./playable-item";
import { usePlaybackSession } from "./use-playback-session";

const SIGN_IN_ROUTE = "#/next/sign-in";

export function PlayerFeatureView() {
  return (
    <main>
      <h1>Player</h1>
      <p>Open a movie or episode and choose Play to start the player.</p>
      <a href="#/next/home">Home</a>
      <a href="#/next">Back to features</a>
    </main>
  );
}

// #/next/play/<itemId>: loads the item, then plays it. Leaving returns to the
// item's detail view (see leavePlayer).
export function PlayerRouteView(route: PlayRoute) {
  const { gateway } = useSession();
  const player = usePlayerServices();

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  if (!gateway) return null;
  return <PlayerLoader gateway={gateway} player={player} route={route} />;
}

function PlayerLoader({ gateway, player, route }: { gateway: SessionGateway; player: PlayerServices; route: PlayRoute }) {
  const query = useQuery({
    queryKey: detailKey(gateway, route.itemId),
    queryFn: ({ signal }) => gateway.itemDetail(route.itemId, signal),
    gcTime: 0,
  });
  const backHref = itemRoute(route.itemId);

  if (query.isPending) {
    return (
      <PlayerMessage>
        <p aria-busy="true">Loading…</p>
        <a href={backHref}>Back to details</a>
      </PlayerMessage>
    );
  }
  if (query.isError) {
    return (
      <PlayerMessage>
        <p role="alert">Could not load this item.</p>
        <button type="button" onClick={() => void query.refetch()}>Try again</button>
        <a href={backHref}>Back to details</a>
      </PlayerMessage>
    );
  }
  return <PlaybackScreen gateway={gateway} player={player} route={route} detail={query.data} />;
}

function PlaybackScreen({ gateway, player, route, detail }: {
  gateway: SessionGateway;
  player: PlayerServices;
  route: PlayRoute;
  detail: ItemDetail;
}) {
  const queryClient = useQueryClient();
  // Fixed for the whole session: a refetch of the detail must not restart playback.
  const [item] = useState(() => toPlayableItem(detail));

  const playback = usePlaybackSession({
    gateway,
    player,
    item,
    mediaSourceId: route.mediaSourceId,
    startTicks: route.startTicks,
    onSessionEnded: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey(gateway, route.itemId) });
      void refreshHomeRows(queryClient);
    },
    onLeave: () => leavePlayer(route.itemId),
  });

  if (playback.refusal) {
    return (
      <PlayerMessage>
        <h1>This item can’t be played</h1>
        <p role="alert">{playback.refusal}</p>
        <button type="button" onClick={() => void playback.back()}>Back to details</button>
      </PlayerMessage>
    );
  }

  return (
    <main className="app-shell has-player">
      <PlayerView
        item={item}
        player={player.engine}
        session={playback.state}
        retrying={playback.retrying}
        onRetry={playback.retry}
        onBack={playback.back}
      />
    </main>
  );
}

function PlayerMessage({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <section className="player-message">{children}</section>
    </main>
  );
}
