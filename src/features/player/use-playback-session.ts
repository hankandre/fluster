import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { LibraryItem } from "../../domain/catalog";
import {
  PlaybackRefusedError,
  UnsupportedDeliveryError,
  secondsToTicks,
  startOverChoice,
  type PlaybackPlan,
  type PlaybackRefusal,
  type PlaybackEndReason,
  type PlaybackSnapshot,
  type PlaybackStartChoice,
  type PlayerEngine,
  type StreamSelection,
} from "../../domain/playback";
import { currentSelection, sourceTrackOptions, trackChange, type TrackKind } from "../../domain/track-choice";
import type { SessionGateway } from "../../app/session";
import type { PlayerServices } from "../../app/player-services";
import { PlaybackCancelledError, PlaybackCoordinator, type PlaybackGateway } from "../../lib/player/coordinator";
import { initialPlaybackSessionState, playbackSessionReducer } from "../../lib/player/session-state";
import { redactText } from "../../lib/redact";
import { limitChangeAffects, limitMbpsFor, mbpsToBitsPerSecond, type StreamingLimitStore } from "../../lib/streaming-limits";

// The last session teardown on each engine: its stop and its playstate drain
// (the Stopped report). A new session waits for it so a late stop (StrictMode
// remount, quick Back then Play) never ends the new playback, and the next
// negotiation never runs ahead of the old Stopped report. Leaving the player
// never waits for it.
const pendingStops = new WeakMap<PlayerEngine, Promise<void>>();

// Adds to the engine's teardown rather than replacing it, so a natural end
// and an explicit stop of the same session are both covered.
function rememberStop(engine: PlayerEngine, teardown: Promise<void>): void {
  const earlier = pendingStops.get(engine) ?? Promise.resolve();
  pendingStops.set(engine, Promise.all([earlier, teardown.catch(() => undefined)]).then(() => undefined));
}

// Resolves once the engine's last session is stopped and its Stopped report
// has been sent or hit its deadline.
export function whenPlaybackStopped(engine: PlayerEngine): Promise<void> {
  return pendingStops.get(engine) ?? Promise.resolve();
}

// Binds the chosen version so every attempt, including retries, asks for it;
// a renegotiation names the playing version and its streams instead.
// `ignoreLimit` is read on every attempt: Play original sets it for this
// session only, and it is never stored.
function playbackGatewayFor(
  gateway: SessionGateway,
  mediaSourceId: string | undefined,
  ignoreLimit: { current: boolean },
): PlaybackGateway {
  return {
    createPlaybackPlan: (item, startPositionTicks, signal, selection) => {
      if (!selection) {
        return gateway.createPlaybackPlan(item, startPositionTicks, signal, mediaSourceId, {
          ignoreStreamingLimit: ignoreLimit.current,
        });
      }
      const { mediaSourceId: playing, ...streams } = selection;
      return gateway.createPlaybackPlan(item, startPositionTicks, signal, playing, {
        ignoreStreamingLimit: ignoreLimit.current,
        ...streams,
      });
    },
    reportStart: (plan, snapshot, signal) => gateway.reportStart(plan, snapshot, signal),
    reportProgress: (plan, snapshot, signal) => gateway.reportProgress(plan, snapshot, signal),
    reportStopped: (plan, snapshot, signal, failed) => gateway.reportStopped(plan, snapshot, signal, failed),
    stopActiveEncoding: (playSessionId, signal) => gateway.stopActiveEncoding(playSessionId, signal),
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
  // The engine stop in flight or done. Repeated Back or Play now presses
  // share it instead of stopping the engine again.
  stop?: Promise<void>;
  // Where to go once stopped (Play next, Cancel). "back" is the viewer's own
  // Back and wins over everything else. Absent means onLeave. It lives only
  // as long as the stop it waits for: a failed stop clears it.
  destination?: (() => void) | "back";
}

// Stops the session, or only marks it stopping when it never started. Resolves
// once the engine has stopped; the Stopped report drains in the background and
// is remembered for the next session.
function stopSession(engine: PlayerEngine, active: ActiveSession): Promise<void> {
  active.stopping = true;
  if (active.stop) return active.stop;
  if (!active.started) return Promise.resolve();
  const stop = active.coordinator.stop();
  active.stop = stop;
  rememberStop(engine, stop.then(() => active.coordinator.flush()));
  return stop;
}

export interface PlaybackSessionOptions {
  gateway: SessionGateway;
  player: PlayerServices;
  item: LibraryItem;
  mediaSourceId: string | undefined;
  startTicks: number;
  // The user's streaming limits. A change to the one for this server while
  // playing renegotiates when it can change the delivery. Optional: without
  // it the session never watches the limit.
  streamingLimits?: StreamingLimitStore;
  // Called whenever a session ends, including failures, so views can refresh.
  onSessionEnded(): void;
  // Leave the player: back, stop, or natural end. The reason is "eof" only
  // when the file played to its end.
  onLeave(reason?: PlaybackEndReason): void;
}

// Runs one playback from negotiation to teardown: one coordinator per session, retry in place, and Back stops
// before leaving.
export function usePlaybackSession(options: PlaybackSessionOptions) {
  const { gateway, player, item, mediaSourceId, startTicks, streamingLimits } = options;
  const { engine, watchWindowClose, watchMediaControls } = player;
  const [state, dispatch] = useReducer(playbackSessionReducer, initialPlaybackSessionState);
  const [retrying, setRetrying] = useState(false);
  const [refusal, setRefusal] = useState<PlaybackRefusal>();
  const [unsupported, setUnsupported] = useState(false);
  const [plan, setPlan] = useState<PlaybackPlan>();
  const session = useRef<ActiveSession | undefined>(undefined);
  const ignoreLimit = useRef(false);
  const [playOriginalRequested, setPlayOriginalRequested] = useState(false);
  const callbacks = useRef(options);

  useEffect(() => {
    callbacks.current = options;
  });

  // Goes to the session's destination when it has one, else to onLeave.
  const leave = useCallback((reason?: PlaybackEndReason) => {
    const active = session.current;
    if (!active) return;
    session.current = undefined;
    active.stopping = true;
    // The engine has already stopped (an explicit stop or a natural end).
    active.stop ??= Promise.resolve();
    // The stop itself ends the session, and that ending lands here first, so
    // the destination is kept on the session rather than passed in.
    const destination = active.destination;
    if (typeof destination === "function") destination();
    else callbacks.current.onLeave(destination === "back" ? undefined : reason);
  }, []);

  const handleFailure = useCallback((error: unknown) => {
    if (error instanceof PlaybackCancelledError) return;
    if (error instanceof PlaybackRefusedError) {
      setRefusal({ reason: error.reason, detail: error.detail });
      return;
    }
    if (error instanceof UnsupportedDeliveryError) {
      setUnsupported(true);
      return;
    }
    dispatch({ type: "failure", message: errorText(error) });
  }, []);

  useEffect(() => {
    let mounted = true;
    ignoreLimit.current = false;
    setPlayOriginalRequested(false);
    const coordinator = new PlaybackCoordinator(playbackGatewayFor(gateway, mediaSourceId, ignoreLimit), engine, {
      onEvent: (event) => {
        if (mounted) dispatch({ type: "event", event });
      },
      onReportingError: (warning) => {
        if (mounted) dispatch({ type: "reporting-warning", message: redactText(warning) });
      },
      onSessionEnded: (reason: PlaybackEndReason) => {
        callbacks.current.onSessionEnded();
        // The engine has stopped. The Stopped report drains in the background:
        // the next session and the window close wait for it, leaving does not.
        rememberStop(engine, coordinator.flush());
        // An error keeps the player open with Retry and Back.
        if (mounted && reason !== "error") leave(reason);
      },
    });
    const active: ActiveSession = { coordinator, started: false, stopping: false };
    session.current = active;
    dispatch({ type: "reset" });
    setRefusal(undefined);
    setUnsupported(false);
    setPlan(undefined);

    const choice: PlaybackStartChoice = startTicks > 0
      ? { kind: "resume", startPositionTicks: startTicks }
      : startOverChoice();
    const previousStop = pendingStops.get(engine) ?? Promise.resolve();
    void previousStop.then(() => {
      // Back or close may have come while the previous stop was running.
      if (!mounted || active.stopping || session.current !== active) return;
      active.started = true;
      coordinator.start(item, choice).then((started) => {
        if (mounted) setPlan(started);
      }).catch((error: unknown) => {
        if (mounted) handleFailure(error);
      });
    });

    const unwatchClose = watchWindowClose?.(async () => {
      await stopSession(engine, active);
      // A session that never started still owes the previous session's stop
      // and its Stopped report before the window may close.
      await previousStop.catch(() => undefined);
      await coordinator.flush();
    });

    return () => {
      mounted = false;
      unwatchClose?.();
      if (session.current === active) session.current = undefined;
      if (!active.stopping) void stopSession(engine, active).catch(() => undefined);
    };
  }, [gateway, engine, watchWindowClose, item, mediaSourceId, startTicks, leave, handleFailure]);

  // Runs a new attempt for the same item in place: Retry, Play original, and
  // track and limit renegotiations.
  const restart = useCallback(async (run: (coordinator: PlaybackCoordinator) => Promise<PlaybackPlan>) => {
    const active = session.current;
    if (!active || active.stopping) return;
    dispatch({ type: "reset" });
    // The player view must be on screen before the engine launches, so the
    // refusal goes away now and comes back if the server refuses again.
    setRefusal(undefined);
    setUnsupported(false);
    setPlan(undefined);
    setRetrying(true);
    try {
      const retried = await run(active.coordinator);
      if (session.current === active) setPlan(retried);
    } catch (error) {
      if (session.current === active) handleFailure(error);
    } finally {
      setRetrying(false);
    }
  }, [handleFailure]);

  const retry = useCallback((startPositionTicks?: number) => (
    restart((coordinator) => coordinator.retry(startPositionTicks))
  ), [restart]);

  // The latest plan and snapshot, for the limit listener and track changes.
  const live = useRef<{ plan?: PlaybackPlan; snapshot?: PlaybackSnapshot }>({});
  useEffect(() => {
    live.current = { plan, snapshot: state.snapshot };
  });

  // Starts a new session for the playing version at the current position
  // with these streams. The old session is stopped and its server encode
  // deleted first (PlaybackCoordinator.renegotiate); Back cancels it.
  const renegotiate = useCallback((streams: StreamSelection) => {
    const seconds = live.current.snapshot?.positionSeconds;
    const ticks = seconds === undefined ? undefined : secondsToTicks(seconds);
    return restart((coordinator) => coordinator.renegotiate(ticks, streams));
  }, [restart]);

  // A converted session offers every source stream; direct play offers
  // what mpv lists (PlayerView's own lists).
  const convertedTracks = useMemo(() => {
    if (plan?.delivery !== "hls") return undefined;
    return {
      audio: sourceTrackOptions(plan, state.snapshot, "audio"),
      subtitle: sourceTrackOptions(plan, state.snapshot, "subtitle"),
    };
  }, [plan, state.snapshot]);

  // Chooses a source stream on a converted session: mpv switches to a
  // stream the conversion carries, anything else renegotiates.
  const changeTrack = useCallback(async (kind: TrackKind, jellyfinIndex: number | undefined) => {
    const { plan: current, snapshot } = live.current;
    if (!current) return;
    const change = trackChange(current, snapshot, kind, jellyfinIndex);
    switch (change.kind) {
      case "local":
        await engine.selectTrack(kind, change.playerId);
        break;
      case "renegotiate":
        await renegotiate(change.selection);
        break;
      case "none":
        break;
    }
  }, [engine, renegotiate]);

  // A new limit for this server while playing renegotiates when it can change
  // the delivery. Play original ignores the limit for this session.
  useEffect(() => {
    if (!streamingLimits) return undefined;
    let applied = limitMbpsFor(gateway.hostClass, streamingLimits.get());
    return streamingLimits.subscribe(() => {
      const next = limitMbpsFor(gateway.hostClass, streamingLimits.get());
      if (next === applied) return;
      applied = next;
      const { plan: current, snapshot } = live.current;
      if (!current || ignoreLimit.current) return;
      if (!limitChangeAffects(current, next === undefined ? undefined : mbpsToBitsPerSecond(next))) return;
      void renegotiate(currentSelection(current, snapshot));
    });
  }, [gateway, streamingLimits, renegotiate]);

  // Renegotiates once without the user's streaming limit, for this session
  // only. Available only while the plan says the limit is the only reason.
  const playOriginal = useCallback(async () => {
    if (!plan?.playOriginalAvailable || ignoreLimit.current) return;
    ignoreLimit.current = true;
    setPlayOriginalRequested(true);
    // Continue from where the viewer is, not from the launch position.
    const seconds = state.snapshot?.positionSeconds;
    await retry(seconds === undefined ? undefined : secondsToTicks(seconds));
  }, [plan, retry, state.snapshot]);

  // Stops the engine, then leaves without waiting for the Stopped report.
  // Resolves false when the stop failed and the player stays open.
  const stopAndLeave = useCallback(async (destination?: () => void): Promise<boolean> => {
    const active = session.current;
    if (!active) return false;
    if (active.destination !== "back") active.destination = destination ?? "back";
    const stop = stopSession(engine, active);
    try {
      await stop;
    } catch (error) {
      // Every press waiting on this stop failed with it and the viewer stays
      // on the player, so none of their destinations survives. The next press
      // starts a fresh stop with its own destination.
      if (active.stop === stop) {
        active.stop = undefined;
        active.stopping = false;
        active.destination = undefined;
        dispatch({ type: "failure", message: errorText(error) });
      }
      return false;
    }
    leave();
    return true;
  }, [engine, leave]);

  const back = useCallback(async () => {
    await stopAndLeave();
  }, [stopAndLeave]);

  // A Stop from the system media controls is Back: it stops, reports
  // Stopped, and leaves.
  useEffect(() => watchMediaControls?.((action) => {
    switch (action) {
      case "stop":
        void stopAndLeave();
        break;
    }
  }), [watchMediaControls, stopAndLeave]);

  return {
    state,
    plan,
    retrying,
    refusal,
    unsupported,
    retry,
    playOriginal,
    playOriginalRequested,
    convertedTracks,
    changeTrack,
    back,
    stopAndLeave,
  };
}
