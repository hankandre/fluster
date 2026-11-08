import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlayerServices, type PlayerServices } from "../../app/player-services";
import { useSession, type SessionGateway } from "../../app/session";
import { PlayerView } from "../../components/PlayerView";
import type { ItemDetail } from "../../domain/catalog";
import { detailKey } from "../detail/detail-key";
import { refreshHomeRows } from "../home";
import { itemRoute, leavePlayer, type PlayRoute } from "../routes";
import { REFUSAL_COPY, type RefusalCopy } from "./refusal-copy";
import { toPlayableItem } from "./playable-item";
import { useMediaSegments } from "./use-media-segments";
import { NextEpisodeCard } from "./next-episode-card";
import { leaveToNext, useAutoPlayCountdown, useNextEpisode } from "./use-auto-play-next";
import { usePlaybackSession } from "./use-playback-session";
import { useSeekPreview } from "./use-seek-preview";

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

  const seekProps = useSeekPreview(gateway, detail, route.mediaSourceId);
  const next = useNextEpisode(gateway, detail);

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
    // A file that plays to its end goes straight to the next episode.
    onLeave: (reason) => {
      if (reason === "eof" && next) leaveToNext(next);
      else leavePlayer(route.itemId);
    },
  });
  const segments = useMediaSegments(gateway, route.itemId, playback.plan);
  const upNext = useAutoPlayCountdown({
    next,
    seriesId: detail.seriesId,
    snapshot: playback.state.snapshot,
    outroStartSeconds: segments.find((segment) => segment.kind === "Outro")?.startSeconds,
    stopAndLeave: playback.stopAndLeave,
  });

  if (playback.refusal) {
    return (
      <RefusalScreen
        copy={REFUSAL_COPY[playback.refusal.reason]}
        onRetry={() => void playback.retry()}
        onBack={() => void playback.back()}
      />
    );
  }

  return (
    <main className="app-shell has-player">
      <PlayerView
        item={item}
        player={player.engine}
        session={playback.state}
        segments={segments}
        retrying={playback.retrying}
        onRetry={playback.retry}
        onBack={playback.back}
        {...seekProps}
      />
      {next && upNext.secondsLeft !== undefined && !playback.state.error && (
        <NextEpisodeCard
          next={next}
          secondsLeft={upNext.secondsLeft}
          onPlayNow={upNext.playNow}
          onCancel={upNext.cancel}
        />
      )}
    </main>
  );
}

// Explains why Fluster will not play this item. There is deliberately no
// "play anyway": Retry asks the server again, Back leaves.
function RefusalScreen({ copy, onRetry, onBack }: {
  copy: RefusalCopy;
  onRetry(): void;
  onBack(): void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <PlayerMessage>
      <div role="alert">
        <h1 ref={heading} tabIndex={-1}>{copy.title}</h1>
        <p>{copy.explanation}</p>
        <p><strong>What you can do:</strong> {copy.whatYouCanDo}</p>
      </div>
      <div className="player-message-actions">
        <button type="button" onClick={onRetry}>Retry</button>
        <button type="button" onClick={onBack}>Back to details</button>
      </div>
    </PlayerMessage>
  );
}

function PlayerMessage({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <section className="player-message">{children}</section>
    </main>
  );
}
