import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { usePlayerServices, type PlayerServices } from "../../app/player-services";
import { useOptionalPreferences } from "../../app/preferences";
import { useSession, type SessionGateway } from "../../app/session";
import { PlayerView } from "../../components/PlayerView";
import { ItemNotFoundError, type ItemDetail, type NextEpisode } from "../../domain/catalog";
import { imageUrlFor, WIDE_IMAGE_WIDTH } from "../card-view";
import { detailKey } from "../detail/detail-key";
import { refreshHomeRows } from "../home";
import { itemRoute, leavePlayer, leaveToDetails, type PlayRoute } from "../routes";
import { REFUSAL_COPY } from "./refusal-copy";
import { detailArt, noticeBackdrop } from "./playback-notice";
import { DesktopOnlyNotice, ItemGoneScreen, ItemLoadNotice, NoticePage, PlayerUnavailableNotice, RefusalNotice } from "./playback-notices";
import { toPlayableItem } from "./playable-item";
import { useMediaSegments } from "./use-media-segments";
import { UpNextCard } from "./chrome/up-next-card";
import { AUTO_PLAY_SECONDS } from "./auto-play-next";
import { creditsStart, leaveToNext, leaveToSeries, useAutoPlayCountdown, useNextEpisode } from "./use-auto-play-next";
import { usePlaybackSession, whenPlaybackStopped } from "./use-playback-session";
import { useSeekPreview } from "./use-seek-preview";
import { useIdleCursor } from "./use-idle-cursor";
import { useEscapeKey } from "../use-escape-key";
import { conversionIndicator } from "./conversion-copy";
import { usePlayerStatus, type ReadyPlayerStatus } from "./player-status";

const SIGN_IN_ROUTE = "#/next/sign-in";
// Retry after a failed track change asks for the tracks that were playing.
const PREVIOUS_TRACKS = "Back to previous tracks";

export function PlayerFeatureView() {
  return (
    <main>
      <h1>Player</h1>
      <p>Open a movie or episode and choose Play to start the player.</p>
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
  // Loaded beside the player check, so a notice can show the item once it arrives.
  const query = useQuery({
    queryKey: detailKey(gateway, route.itemId),
    queryFn: ({ signal }) => gateway.itemDetail(route.itemId, signal),
    gcTime: 0,
  });

  if (status.kind === "checking") {
    return (
      <PlayerMessage onEscape={() => leavePlayer(route.itemId)}>
        <p aria-busy="true">Checking the player…</p>
      </PlayerMessage>
    );
  }
  if (status.kind === "unavailable") {
    return (
      <NoticePage>
        <PlayerUnavailableNotice
          {...detailArt(gateway, query.data)}
          reason={status.reason}
          onRetry={recheck}
          onBack={() => leaveToDetails(route.itemId)}
        />
      </NoticePage>
    );
  }
  return <PlayerLoader gateway={gateway} player={player} route={route} status={status} query={query} />;
}

function PlayerLoader({ gateway, player, route, status, query }: {
  gateway: SessionGateway;
  player: PlayerServices;
  route: PlayRoute;
  status: ReadyPlayerStatus;
  query: UseQueryResult<ItemDetail>;
}) {
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
    if (query.error instanceof ItemNotFoundError) {
      return (
        <NoticePage>
          <ItemGoneScreen onBack={() => leaveToDetails(route.itemId)} />
        </NoticePage>
      );
    }
    return (
      <NoticePage>
        <ItemLoadNotice
          {...detailArt(gateway, query.data)}
          onRetry={() => void query.refetch()}
          onBack={() => leaveToDetails(route.itemId)}
        />
      </NoticePage>
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
  const preferences = useOptionalPreferences();
  // Fixed for the whole session: a refetch of the detail must not restart playback.
  const [item] = useState(() => toPlayableItem(detail));

  const seekProps = useSeekPreview(gateway, detail, route.mediaSourceId);
  const next = useNextEpisode(gateway, detail);

  // Leaving at the credits stops short of the server's played threshold, so
  // finishing an episode into the next one marks it played. This runs after
  // the Stopped report, which may still be draining when the player leaves.
  // Hide and Back do not mark anything.
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
    streamingLimits: preferences?.streamingLimits,
    onSessionEnded: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey(gateway, route.itemId) });
      void refreshHomeRows(queryClient);
    },
    // A file that plays to its end goes straight to the next episode, unless
    // Hide dismissed the card: then it opens the series page. upNext is
    // declared below; this runs after render and reads it through the closure
    // (use-playback-session refreshes its callbacks on every render).
    onLeave: (reason) => {
      if (reason === "eof" && next && upNext.dismissed && detail.seriesId) leaveToSeries(detail.seriesId);
      else if (reason === "eof" && next && !upNext.dismissed) advanceTo(next);
      else if (leaveTarget.current === "details") leaveToDetails(route.itemId);
      else leavePlayer(route.itemId);
    },
  });
  const indicator = conversionIndicator(playback.plan);
  const backdrop = noticeBackdrop(gateway, detail);
  // "Back to details" always lands on the item's detail view; Escape and the top bar's Back go
  // back to wherever the player was opened from.
  const leaveTarget = useRef<"opener" | "details">("opener");
  const segments = useMediaSegments(gateway, route.itemId, playback.plan);
  const cursor = useIdleCursor();
  const upNext = useAutoPlayCountdown({
    next,
    snapshot: playback.state.snapshot,
    outroStartSeconds: creditsStart(segments),
    failed: Boolean(playback.state.error),
    advance: advanceTo,
    stopAndLeave: playback.stopAndLeave,
  });

  // Up Next takes the place of Skip credits when a next episode exists (Q19 A).
  const offeredSegments = next ? segments.filter((segment) => segment.kind !== "Outro") : segments;
  const showCard = Boolean(next) && upNext.secondsLeft !== undefined && !playback.state.error;

  const backToDetails = () => {
    leaveTarget.current = "details";
    return playback.back();
  };

  if (playback.unsupported) {
    return (
      <NoticePage>
        <DesktopOnlyNotice item={item} backdrop={backdrop} onBack={() => void backToDetails()} />
      </NoticePage>
    );
  }

  if (playback.refusal) {
    return (
      <NoticePage>
        <RefusalNotice
          copy={REFUSAL_COPY[playback.refusal.reason]}
          item={item}
          backdrop={backdrop}
          onRetry={() => void playback.retry()}
          retryLabel={playback.previousTracksOffered ? PREVIOUS_TRACKS : undefined}
          onBack={() => void backToDetails()}
        />
      </NoticePage>
    );
  }

  return (
    <main className={`app-shell has-player${cursor.idle ? " cursor-idle" : ""}`} onPointerMove={cursor.onPointerMove}>
      <PlayerView
        item={item}
        player={player.engine}
        session={playback.state}
        status={status}
        segments={offeredSegments}
        retrying={playback.retrying}
        onRetry={playback.retry}
        onBack={playback.back}
        onBackToDetails={backToDetails}
        retryLabel={playback.previousTracksOffered ? PREVIOUS_TRACKS : undefined}
        convertedTracks={playback.convertedTracks}
        onChangeConvertedTrack={playback.changeTrack}
        playMethod={playback.plan?.playMethod}
        indicator={indicator}
        playOriginal={{
          available: Boolean(playback.plan?.playOriginalAvailable) && !playback.retrying,
          stillConverting: playback.playOriginalRequested && playback.plan?.delivery === "hls" && !playback.retrying,
          onPlay: () => void playback.playOriginal(),
        }}
        backdrop={backdrop}
        prompt={showCard && next && upNext.secondsLeft !== undefined ? (
          <UpNextCard
            next={next}
            stillSrc={next.image ? imageUrlFor(gateway)(next.image, WIDE_IMAGE_WIDTH) : undefined}
            secondsLeft={upNext.secondsLeft}
            totalSeconds={AUTO_PLAY_SECONDS}
            paused={playback.state.snapshot?.paused ?? false}
            onPlayNow={upNext.playNow}
            onHide={upNext.hide}
          />
        ) : undefined}
        onPlayNext={showCard ? upNext.playNow : undefined}
        {...seekProps}
      />
    </main>
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
