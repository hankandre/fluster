import { useCallback, useEffect, useReducer, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import type { ItemDetail, NextEpisode } from "../../domain/catalog";
import type { PlaybackSnapshot } from "../../domain/playback";
import { scopeFor } from "../query-scope";
import { playRoute, seriesRoute } from "../routes";
import {
  autoPlayReducer,
  endWindowSeconds,
  inEndWindow,
  type AutoPlayState,
} from "./auto-play-next";

// The episode after this one. Only episodes of a series ask; a movie, or an
// episode without a series id, makes no request.
export function useNextEpisode(gateway: SessionGateway, detail: ItemDetail): NextEpisode | undefined {
  const seriesId = detail.type === "Episode" ? detail.seriesId : undefined;
  const query = useQuery({
    queryKey: ["next-episode", scopeFor(gateway), detail.id] as const,
    queryFn: ({ signal }) => gateway.nextEpisode(seriesId!, detail.id, signal),
    enabled: seriesId !== undefined,
    gcTime: 0,
    // A failed lookup only means no card; it must never interrupt playback.
    retry: false,
  });
  return query.data;
}

export function playNextRoute(next: NextEpisode): string {
  return playRoute({ itemId: next.id, startTicks: 0 });
}

export function leaveToNext(next: NextEpisode): void {
  window.location.replace(playNextRoute(next));
}

export function leaveToSeries(seriesId: string): void {
  window.location.replace(seriesRoute(seriesId));
}

export interface AutoPlayCountdown {
  // Undefined while the card is hidden.
  secondsLeft: number | undefined;
  playNow(): void;
  cancel(): void;
}

// Shows the card near the end of an episode and counts down one second at a
// time (a timeout per tick, cleared on every change). Playing counts; paused
// holds the countdown. At zero it advances.
export function useAutoPlayCountdown({ next, seriesId, snapshot, stopAndLeave }: {
  next: NextEpisode | undefined;
  seriesId: string | undefined;
  snapshot: PlaybackSnapshot | undefined;
  stopAndLeave(destination: () => void): Promise<boolean>;
}): AutoPlayCountdown {
  const [state, dispatch] = useReducer(autoPlayReducer, { secondsLeft: undefined } satisfies AutoPlayState);
  const leaving = useRef(false);
  const position = snapshot?.positionSeconds ?? 0;
  const duration = snapshot?.durationSeconds;
  const paused = snapshot?.paused ?? false;
  const inWindow = Boolean(next) && inEndWindow(position, duration, endWindowSeconds());

  useEffect(() => {
    dispatch({ type: "window", inWindow });
  }, [inWindow]);

  const go = useCallback((destination: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    void stopAndLeave(destination).then((left) => {
      if (!left) leaving.current = false;
    });
  }, [stopAndLeave]);

  const playNow = useCallback(() => {
    if (next) go(() => leaveToNext(next));
  }, [go, next]);

  const cancel = useCallback(() => {
    if (seriesId) go(() => leaveToSeries(seriesId));
  }, [go, seriesId]);

  const secondsLeft = next ? state.secondsLeft : undefined;
  useEffect(() => {
    if (secondsLeft === undefined || paused) return;
    if (secondsLeft === 0) {
      playNow();
      return;
    }
    const timer = window.setTimeout(() => dispatch({ type: "tick" }), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, paused, playNow]);

  return { secondsLeft, playNow, cancel };
}
