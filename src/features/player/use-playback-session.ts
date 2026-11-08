import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { LibraryItem } from "../../domain/catalog";
import {
  PlaybackRefusedError,
  startOverChoice,
  type PlaybackEndReason,
  type PlaybackStartChoice,
  type PlayerEngine,
} from "../../domain/playback";
import type { SessionGateway } from "../../app/session";
import type { PlayerServices } from "../../app/player-services";
import { PlaybackCancelledError, PlaybackCoordinator, type PlaybackGateway } from "../../lib/player/coordinator";
import { initialPlaybackSessionState, playbackSessionReducer } from "../../lib/player/session-state";
import { redactText } from "../../lib/redact";

// The last stop sent to each engine. A new session waits for it so a late
// stop (StrictMode remount, quick Back then Play) never ends the new playback.
const pendingStops = new WeakMap<PlayerEngine, Promise<void>>();

function rememberStop(engine: PlayerEngine, stop: Promise<void>): Promise<void> {
  pendingStops.set(engine, stop.catch(() => undefined));
  return stop;
}

// Binds the chosen version so every attempt, including retries, asks for it.
function playbackGatewayFor(gateway: SessionGateway, mediaSourceId: string | undefined): PlaybackGateway {
  return {
    createPlaybackPlan: (item, startPositionTicks, signal) =>
      gateway.createPlaybackPlan(item, startPositionTicks, signal, mediaSourceId),
    reportStart: (plan, snapshot, signal) => gateway.reportStart(plan, snapshot, signal),
    reportProgress: (plan, snapshot, signal) => gateway.reportProgress(plan, snapshot, signal),
    reportStopped: (plan, snapshot, signal, failed) => gateway.reportStopped(plan, snapshot, signal, failed),
  };
}

function errorText(error: unknown): string {
  return redactText(error instanceof Error ? error.message : "Something went wrong.");
}

interface ActiveSession {
  coordinator: PlaybackCoordinator;
  // Set once start() runs. A session that never started has nothing to stop.
  started: boolean;
  // Set once Back, close, or unmount owns teardown. A stopping session never
  // starts, and unmounting does not stop it twice.
  stopping: boolean;
}

// Stops the session, or only marks it stopping when it never started.
function stopSession(engine: PlayerEngine, active: ActiveSession): Promise<void> {
  active.stopping = true;
  if (!active.started) return Promise.resolve();
  return rememberStop(engine, active.coordinator.stop());
}

export interface PlaybackSessionOptions {
  gateway: SessionGateway;
  player: PlayerServices;
  item: LibraryItem;
  mediaSourceId: string | undefined;
  startTicks: number;
  // Called whenever a session ends, including failures, so views can refresh.
  onSessionEnded(): void;
  // Leave the player: back, stop, or natural end.
  onLeave(): void;
}

// Runs one playback from negotiation to teardown, like the proof of concept's
// player wiring: one coordinator per session, retry in place, and Back stops
// before leaving.
export function usePlaybackSession(options: PlaybackSessionOptions) {
  const { gateway, player, item, mediaSourceId, startTicks } = options;
  const { engine, watchWindowClose } = player;
  const [state, dispatch] = useReducer(playbackSessionReducer, initialPlaybackSessionState);
  const [retrying, setRetrying] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const session = useRef<ActiveSession | undefined>(undefined);
  const callbacks = useRef(options);

  useEffect(() => {
    callbacks.current = options;
  });

  const leave = useCallback(() => {
    const active = session.current;
    if (!active) return;
    session.current = undefined;
    active.stopping = true;
    callbacks.current.onLeave();
  }, []);

  const handleFailure = useCallback((error: unknown) => {
    if (error instanceof PlaybackCancelledError) return;
    if (error instanceof PlaybackRefusedError) {
      setRefusal(error.message);
      return;
    }
    dispatch({ type: "failure", message: errorText(error) });
  }, []);

  useEffect(() => {
    let mounted = true;
    const coordinator = new PlaybackCoordinator(playbackGatewayFor(gateway, mediaSourceId), engine, {
      onEvent: (event) => {
        if (mounted) dispatch({ type: "event", event });
      },
      onReportingError: (warning) => {
        if (mounted) dispatch({ type: "reporting-warning", message: redactText(warning) });
      },
      onSessionEnded: (reason: PlaybackEndReason) => {
        callbacks.current.onSessionEnded();
        // An error keeps the player open with Retry and Back.
        if (mounted && reason !== "error") leave();
      },
    });
    const active: ActiveSession = { coordinator, started: false, stopping: false };
    session.current = active;
    dispatch({ type: "reset" });
    setRefusal(undefined);

    const choice: PlaybackStartChoice = startTicks > 0
      ? { kind: "resume", startPositionTicks: startTicks }
      : startOverChoice();
    const previousStop = pendingStops.get(engine) ?? Promise.resolve();
    void previousStop.then(() => {
      // Back or close may have come while the previous stop was running.
      if (!mounted || active.stopping || session.current !== active) return;
      active.started = true;
      coordinator.start(item, choice).catch((error: unknown) => {
        if (mounted) handleFailure(error);
      });
    });

    const unwatchClose = watchWindowClose?.(async () => {
      await stopSession(engine, active);
      await coordinator.flush();
    });

    return () => {
      mounted = false;
      unwatchClose?.();
      if (session.current === active) session.current = undefined;
      if (!active.stopping) void stopSession(engine, active).catch(() => undefined);
    };
  }, [gateway, engine, watchWindowClose, item, mediaSourceId, startTicks, leave, handleFailure]);

  const retry = useCallback(async () => {
    const active = session.current;
    if (!active) return;
    dispatch({ type: "reset" });
    setRetrying(true);
    try {
      await active.coordinator.retry();
    } catch (error) {
      if (session.current === active) handleFailure(error);
    } finally {
      setRetrying(false);
    }
  }, [handleFailure]);

  const back = useCallback(async () => {
    const active = session.current;
    if (!active) return;
    try {
      await stopSession(engine, active);
    } catch (error) {
      active.stopping = false;
      dispatch({ type: "failure", message: errorText(error) });
      return;
    }
    leave();
  }, [engine, leave]);

  return { state, retrying, refusal, retry, back };
}
