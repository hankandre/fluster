import { useCallback, useEffect, useReducer, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import type { ItemDetail, NextEpisode } from "../../domain/catalog";
import type { MediaSegment } from "../../domain/media-segments";
import type { PlaybackSnapshot } from "../../domain/playback";
import { type AutoPlayPreference } from "../../lib/preference-store";
import { scopeFor } from "../query-scope";
import { playRoute, seriesRoute } from "../routes";
import {
  autoPlayReducer,
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

// The Outro that counts as credits: the last one the server marks.
export function creditsStart(segments: MediaSegment[]): number | undefined {
  return segments.filter((segment) => segment.kind === "Outro").at(-1)?.startSeconds;
}

export function leaveToSeries(seriesId: string): void {
  window.location.replace(seriesRoute(seriesId));
}

export interface AutoPlayCountdown {
  // True while the card is on screen: in the end window and not hidden. With
  // auto-play off it shows without a countdown.
  shown: boolean;
  // Undefined while the card is hidden, and always with auto-play off.
  secondsLeft: number | undefined;
  // The length the running countdown started with; undefined when none runs.
  totalSeconds: number | undefined;
  // True after Hide: no card and no advance for the rest of the session.
  dismissed: boolean;
  playNow(): void;
  hide(): void;
}

// Shows the card near the end of an episode and counts down one second at a
// time (a timeout per tick, cleared on every change). Playing counts; paused
// holds the countdown. At zero it advances.
export function useAutoPlayCountdown({ next, snapshot, outroStartSeconds, autoPlay, failed, advance, stopAndLeave }: {
  next: NextEpisode | undefined;
  snapshot: PlaybackSnapshot | undefined;
  // Where the credits start, from the Outro media segment, when there is one.
  outroStartSeconds?: number;
  // The viewer's choice, live: a change applies at once (DESIGN.md 7.15). Off: the card shows, nothing counts or advances.
  autoPlay: AutoPlayPreference;
  // Any playback error or refusal: no card and no advance, so the viewer can
  // read the error and choose Retry or Back.
  failed: boolean;
  // Leaves for the next episode. Called once the old session is stopped.
  advance(next: NextEpisode): void;
  stopAndLeave(destination: () => void): Promise<boolean>;
}): AutoPlayCountdown {
  const [state, dispatch] = useReducer(autoPlayReducer, { secondsLeft: undefined, totalSeconds: undefined, dismissed: false } satisfies AutoPlayState);
  const leaving = useRef(false);
  const position = snapshot?.positionSeconds ?? 0;
  const duration = snapshot?.durationSeconds;
  const paused = snapshot?.paused ?? false;
  const inWindow = Boolean(next) && !failed && inEndWindow(position, duration, outroStartSeconds, autoPlay.countdownSeconds);

  useEffect(() => {
    // With auto-play off no countdown state exists: the card follows inWindow alone.
    dispatch({ type: "window", inWindow: inWindow && autoPlay.enabled, countdownSeconds: autoPlay.countdownSeconds });
  }, [inWindow, autoPlay.enabled, autoPlay.countdownSeconds]);

  const go = useCallback((destination: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    void stopAndLeave(destination).then((left) => {
      if (!left) leaving.current = false;
    });
  }, [stopAndLeave]);

  // The caller's advance changes every render; playNow keeps its identity and reads the latest one when it runs.
  const latestAdvance = useRef(advance);
  useEffect(() => {
    latestAdvance.current = advance;
  });

  const playNow = useCallback(() => {
    if (next) go(() => latestAdvance.current(next));
  }, [go, next]);

  // Hide keeps playing and cancels the advance; the end of the file then
  // leaves for the series page (see onLeave in the player).
  const hide = useCallback(() => dispatch({ type: "hide" }), []);

  const secondsLeft = next && !failed && autoPlay.enabled ? state.secondsLeft : undefined;
  const shown = Boolean(next) && !failed && !state.dismissed && (autoPlay.enabled ? secondsLeft !== undefined : inWindow);
  useEffect(() => {
    if (secondsLeft === undefined || paused) return;
    if (secondsLeft === 0) {
      playNow();
      return;
    }
    const timer = window.setTimeout(() => dispatch({ type: "tick" }), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, paused, playNow]);

  return { shown, secondsLeft, totalSeconds: secondsLeft === undefined ? undefined : state.totalSeconds, dismissed: state.dismissed, playNow, hide };
}
