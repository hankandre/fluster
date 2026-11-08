import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlayerServices, type PlayerServices } from "../../app/player-services";
import { useSession, type SessionGateway } from "../../app/session";
import { PlayerView } from "../../components/PlayerView";
import type { ItemDetail, NextEpisode } from "../../domain/catalog";
import { detailKey } from "../detail/detail-key";
import { refreshHomeRows } from "../home";
import { itemRoute, leavePlayer, type PlayRoute } from "../routes";
import { REFUSAL_COPY, type RefusalCopy } from "./refusal-copy";
import { toPlayableItem } from "./playable-item";
import { useMediaSegments } from "./use-media-segments";
import { NextEpisodeCard } from "./next-episode-card";
import { creditsStart, leaveToNext, useAutoPlayCountdown, useNextEpisode } from "./use-auto-play-next";
import { usePlaybackSession, whenPlaybackStopped } from "./use-playback-session";
import { useSeekPreview } from "./use-seek-preview";
import { useIdleCursor } from "./use-idle-cursor";
import { useEscapeKey } from "../use-escape-key";
import { safeReason } from "./safe-reason";
import { PlayerInfoPanel } from "./player-info-panel";
import { usePlayerStatus, type ReadyPlayerStatus } from "./player-status";

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
  return <PlayerGate gateway={gateway} player={player} route={route} />;
}

// A player that cannot start is reported here, with the reason, instead of
// being launched. The browser player is never blocked.
function PlayerGate({ gateway, player, route }: { gateway: SessionGateway; player: PlayerServices; route: PlayRoute }) {
  const { status, recheck } = usePlayerStatus();
  const backHref = itemRoute(route.itemId);

  if (status.kind === "checking") {
    return (
      <PlayerMessage onEscape={() => leavePlayer(route.itemId)}>
        <p aria-busy="true">Checking the player…</p>
      </PlayerMessage>
    );
  }
  if (status.kind === "unavailable") {
    return (
      <PlayerMessage onEscape={() => leavePlayer(route.itemId)}>
        <div role="alert">
          <h1>The player cannot start</h1>
          <p>{safeReason(status.reason)}</p>
        </div>
        <div className="player-message-actions">
          <button type="button" onClick={recheck}>Try again</button>
          <a href={backHref}>Back to details</a>
        </div>
      </PlayerMessage>
    );
  }
  return <PlayerLoader gateway={gateway} player={player} route={route} status={status} />;
}

function PlayerLoader({ gateway, player, route, status }: {
  gateway: SessionGateway;
  player: PlayerServices;
  route: PlayRoute;
  status: ReadyPlayerStatus;
}) {
  const query = useQuery({
    queryKey: detailKey(gateway, route.itemId),
    queryFn: ({ signal }) => gateway.itemDetail(route.itemId, signal),
    gcTime: 0,
  });
  const backHref = itemRoute(route.itemId);
  const leave = () => leavePlayer(route.itemId);

  if (query.isPending) {
    return (
      <PlayerMessage onEscape={leave}>
        <p aria-busy="true">Loading…</p>
        <a href={backHref}>Back to details</a>
      </PlayerMessage>
    );
  }
  if (query.isError) {
    return (
      <PlayerMessage onEscape={leave}>
        <p role="alert">Could not load this item.</p>
        <button type="button" onClick={() => void query.refetch()}>Try again</button>
        <a href={backHref}>Back to details</a>
      </PlayerMessage>
    );
  }
  return <PlaybackScreen gateway={gateway} player={player} route={route} detail={query.data} status={status} />;
}

function PlaybackScreen({ gateway, player, route, detail, status }: {
  status: ReadyPlayerStatus;
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

  // Leaving at the credits stops short of the server's played threshold, so
  // finishing an episode into the next one marks it played. This runs after
  // the Stopped report, which may still be draining when the player leaves.
  // Cancel and Back do not mark anything.
  const advanceTo = (target: NextEpisode) => {
    leaveToNext(target);
    void whenPlaybackStopped(player.engine)
      .then(() => gateway.setPlayed(route.itemId, true))
      .then(() => refreshHomeRows(queryClient))
      .catch(() => undefined);
  };

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
      if (reason === "eof" && next) advanceTo(next);
      else leavePlayer(route.itemId);
    },
  });
  const segments = useMediaSegments(gateway, route.itemId, playback.plan);
  const cursor = useIdleCursor();
  const upNext = useAutoPlayCountdown({
    next,
    seriesId: detail.seriesId,
    snapshot: playback.state.snapshot,
    outroStartSeconds: creditsStart(segments),
    failed: Boolean(playback.state.error),
    advance: advanceTo,
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
    <main className={`app-shell has-player${cursor.idle ? " cursor-idle" : ""}`} onPointerMove={cursor.onPointerMove}>
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
      <PlayerInfoPanel status={status} snapshot={playback.state.snapshot} playMethod={playback.plan?.playMethod} />
      {playback.playOriginalRequested && playback.plan?.delivery === "hls" && !playback.retrying && (
        <p className="play-original-note" role="status">The server still converts this.</p>
      )}
      {playback.plan?.playOriginalAvailable && !playback.retrying && (
        <button type="button" className="play-original" onClick={() => void playback.playOriginal()}>
          Play original
        </button>
      )}
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
    <PlayerMessage onEscape={onBack}>
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

// Escape leaves, like the player itself.
function PlayerMessage({ onEscape, children }: { onEscape(): void; children: ReactNode }) {
  useEscapeKey(onEscape);
  return (
    <main className="app-shell">
      <section className="player-message">{children}</section>
    </main>
  );
}
