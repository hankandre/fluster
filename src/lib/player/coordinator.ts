import type { LibraryItem } from "../../domain/catalog";
import type {
  PlaybackEndReason,
  PlaybackPlan,
  PlaybackSnapshot,
  PlaybackStartChoice,
  PlayerEngine,
  PlayerEvent,
  ServerPlayMethod,
  StreamSelection,
} from "../../domain/playback";
import { startOverChoice } from "../../domain/playback";
import { redactError, redactText } from "../redact";
import { redactTransportError } from "../transport-error";
import { confirmedPlan } from "./confirm-play-method";
import { PlaystateReporter, type PlaystateGateway } from "./playstate-reporter";

// When a converted session asks the server what it really does: 3 s after
// the first frame, and once more at 10 s if the server had no answer yet.
export const PLAY_METHOD_CHECKS_MS = [3_000, 10_000] as const;

// The version and streams a renegotiation asks for. The server applies the
// stream indices only to the source named by mediaSourceId.
export interface PlaybackSelection extends StreamSelection {
  mediaSourceId: string;
}

export interface PlaybackGateway extends PlaystateGateway {
  // `selection` is passed only after a renegotiation chose streams.
  createPlaybackPlan(
    item: LibraryItem,
    startPositionTicks: number,
    signal?: AbortSignal,
    selection?: PlaybackSelection,
  ): Promise<PlaybackPlan>;
  // The server session's view of a running conversion. Without it a
  // converted plan keeps its provisional label.
  sessionPlayMethod?(plan: Pick<PlaybackPlan, "itemId" | "mediaSourceId">, signal?: AbortSignal): Promise<ServerPlayMethod | undefined>;
}

type RestartReason = "retry" | "renegotiate";

export interface CoordinatorCallbacks {
  onEvent(event: PlayerEvent): void;
  onReportingError(message: string): void;
  onSessionEnded?(reason: PlaybackEndReason): void;
  // A converted session's plan after the server confirmed copy or encode.
  onPlanConfirmed?(plan: PlaybackPlan): void;
}

export class PlaybackCancelledError extends Error {
  constructor() {
    super("Playback was cancelled.");
    this.name = "PlaybackCancelledError";
  }
}

export class PlaybackCoordinator {
  private item?: LibraryItem;
  private choice?: PlaybackStartChoice;
  private plan?: PlaybackPlan;
  private snapshot?: PlaybackSnapshot;
  private unsubscribe?: () => void;
  private attempt = 0;
  private operation = 0;
  // The last plan this coordinator launched. A retry must not reuse its play
  // session, and a converted one has its server encode stopped first.
  private previousPlan?: PlaybackPlan;
  // The streams the last renegotiation chose. Later attempts for the item
  // (Retry, another renegotiation) keep them.
  private selection?: PlaybackSelection;
  private attemptController?: AbortController;
  private attemptTask?: Promise<PlaybackPlan>;
  // The stop that cancelled a pending launch. Every later stop waits for it,
  // so it can never reach the engine after the next launch began.
  private cancelStop?: Promise<void>;
  private finishTask?: Promise<void>;
  private requestedStopReason?: RestartReason | "stopped";
  private eventQueue: Promise<void> = Promise.resolve();
  // The current attempt's play-method check; aborted when the attempt ends.
  private confirmController?: AbortController;
  private readonly reporter: PlaystateReporter;

  constructor(
    private readonly gateway: PlaybackGateway,
    private readonly player: PlayerEngine,
    private readonly callbacks: CoordinatorCallbacks,
  ) {
    this.reporter = new PlaystateReporter(gateway, (message) => callbacks.onReportingError(message));
  }

  start(
    item: LibraryItem,
    choice: PlaybackStartChoice = startOverChoice(),
  ): Promise<PlaybackPlan> {
    if (this.attemptTask || this.plan || this.unsubscribe) {
      return Promise.reject(new Error("Another item is already playing."));
    }
    this.operation += 1;
    this.item = item;
    this.choice = choice;
    this.selection = undefined;
    return this.runAttempt(item, choice, false);
  }

  // Renegotiates the same item. `startPositionTicks` restarts from that
  // position (Play original uses the current one); omitted, it keeps the
  // original start choice.
  retry(startPositionTicks?: number): Promise<PlaybackPlan> {
    return this.restart("retry", startPositionTicks);
  }

  // Replaces a playing session with a new one for the same version at
  // `startPositionTicks`, asking for `streams` on top of any earlier choice
  // (a track or streaming-limit change, or Play original). The old session's
  // Stopped report says Failed so the server leaves watch history alone (see
  // finishSession). Stop or Back cancels it like any attempt. When the new session fails, later attempts ask for
  // `fallback` instead (the streams that were playing), so Retry goes back to
  // what worked.
  renegotiate(
    startPositionTicks: number | undefined,
    streams: StreamSelection,
    fallback?: StreamSelection,
  ): Promise<PlaybackPlan> {
    const mediaSourceId = this.previousPlan?.mediaSourceId;
    if (!mediaSourceId) return this.restart("renegotiate", startPositionTicks);
    return this.restart(
      "renegotiate",
      startPositionTicks,
      { ...this.selection, ...streams, mediaSourceId },
      fallback && { ...fallback, mediaSourceId },
    );
  }

  private async restart(
    reason: RestartReason,
    startPositionTicks: number | undefined,
    selection?: PlaybackSelection,
    fallback?: PlaybackSelection,
  ): Promise<PlaybackPlan> {
    const item = this.item;
    if (!item || !this.choice) throw new Error("There is no playback attempt to retry.");
    const choice: PlaybackStartChoice = startPositionTicks === undefined
      ? this.choice
      : { kind: "resume", startPositionTicks: Math.max(0, Math.floor(startPositionTicks)) };

    const operation = ++this.operation;
    this.cancelAttempt();
    await this.waitForAttempt();
    this.assertCurrentSession(operation, item);
    await this.stopAttempt(reason);
    // The session may have ended on its own (end of file) while it stopped;
    // then nothing owns the engine any more and nothing may launch.
    this.assertCurrentSession(operation, item);
    this.choice = choice;
    if (selection) this.selection = selection;
    // Retry, Play original, and track and limit changes start a new play
    // session, so a converting one's server encode is stopped first. The new
    // attempt waits for it (bounded) before negotiating; Stop or Back cancels
    // that wait.
    if (this.previousPlan) this.reporter.stopEncoding(this.previousPlan);
    try {
      return await this.runAttempt(item, choice, true);
    } catch (error) {
      if (fallback && !(error instanceof PlaybackCancelledError) && this.item === item) this.selection = fallback;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.operation += 1;
    this.cancelAttempt();
    await this.waitForAttempt();
    await this.stopAttempt("stopped");
    this.item = undefined;
    this.choice = undefined;
  }

  async flush(): Promise<void> {
    await this.eventQueue;
    await this.reporter.waitForDrains();
    if (this.plan || this.unsubscribe) await this.reporter.waitForQueue();
  }

  private runAttempt(
    item: LibraryItem,
    choice: PlaybackStartChoice,
    isRetry: boolean,
  ): Promise<PlaybackPlan> {
    const task = this.beginAttempt(item, choice, isRetry);
    this.attemptTask = task;
    void task.finally(() => {
      if (this.attemptTask === task) this.attemptTask = undefined;
    }).catch(() => undefined);
    return task;
  }

  private async beginAttempt(
    item: LibraryItem,
    choice: PlaybackStartChoice,
    isRetry: boolean,
  ): Promise<PlaybackPlan> {
    const attempt = ++this.attempt;
    const controller = new AbortController();
    this.attemptController = controller;
    this.resetAttempt();
    // Back or a newer attempt must not wait for a slow server to finish the
    // previous session's reports; stop waiting as soon as this attempt aborts.
    await untilSettledOrAborted(this.reporter.waitForDrains(), controller.signal);
    this.assertCurrentAttempt(attempt, controller);

    let plan: PlaybackPlan;
    const selection = this.selection;
    try {
      plan = await (selection
        ? this.gateway.createPlaybackPlan(item, choice.startPositionTicks, controller.signal, selection)
        : this.gateway.createPlaybackPlan(item, choice.startPositionTicks, controller.signal));
    } catch (error) {
      if (!this.isCurrentAttempt(attempt, controller)) throw new PlaybackCancelledError();
      throw redactTransportError(error);
    }
    this.assertCurrentAttempt(attempt, controller);
    if (isRetry && plan.playSessionId === this.previousPlan?.playSessionId) {
      throw new Error("Jellyfin reused the failed playback session. Retry again to request a fresh session.");
    }

    const unsubscribe = await this.player.subscribe((event) => {
      this.eventQueue = this.eventQueue.then(() => this.handleEvent(attempt, event));
    });
    if (!this.isCurrentAttempt(attempt, controller)) {
      unsubscribe();
      throw new PlaybackCancelledError();
    }

    this.previousPlan = plan;
    this.plan = plan;
    this.unsubscribe = unsubscribe;
    // A converted launch can spend seconds checking playlists before it
    // resolves. Back, Stop, or a newer attempt asks the engine to stop at
    // once, which cancels a pending launch, instead of waiting it out.
    const cancelLaunch = () => {
      this.cancelStop = this.player.stop().catch(() => undefined);
    };
    controller.signal.addEventListener("abort", cancelLaunch, { once: true });
    try {
      await this.player.launch(plan);
      this.assertCurrentAttempt(attempt, controller);
      return plan;
    } catch (error) {
      if (this.isCurrentAttempt(attempt, controller)) {
        // Let a queued "loaded" event report the start first, then end the
        // session as failed so a reported start always gets a stopped report.
        await this.eventQueue;
        await this.finish("error", this.snapshot);
        throw redactError(error);
      }
      // Stop or a newer attempt cancelled this launch; its error is moot.
      throw new PlaybackCancelledError();
    } finally {
      controller.signal.removeEventListener("abort", cancelLaunch);
    }
  }

  private cancelAttempt(): void {
    this.attemptController?.abort();
    this.attemptController = undefined;
  }

  private async waitForAttempt(): Promise<void> {
    try {
      await this.attemptTask;
    } catch {
      // Cancellation and launch failures are handled by the caller or retry UI.
    }
  }

  private async stopAttempt(reason: RestartReason | "stopped"): Promise<void> {
    this.reporter.stopProgress();
    this.requestedStopReason = reason;
    try {
      await this.cancelStop;
      this.cancelStop = undefined;
      await this.player.stop();
      await this.eventQueue;
      await this.finish(reason, this.snapshot);
    } finally {
      this.requestedStopReason = undefined;
    }
  }

  private async handleEvent(attempt: number, event: PlayerEvent): Promise<void> {
    if (attempt !== this.attempt) return;
    this.callbacks.onEvent(event.kind === "error" ? { ...event, message: redactText(event.message) } : event);
    if ("snapshot" in event && event.snapshot) this.snapshot = event.snapshot;
    const plan = this.plan;
    if (!plan) return;

    switch (event.kind) {
      case "loaded":
        this.reporter.start(plan, event.snapshot, () => this.snapshot, () => this.plan);
        break;
      case "tracks-changed":
        this.reporter.progress(plan, event.snapshot);
        break;
      case "state":
        if (event.cause === "pause" || event.cause === "seek") {
          this.reporter.progress(plan, event.snapshot);
        }
        break;
      case "ended":
        if (this.requestedStopReason) {
          // The explicit stop owns teardown. Wait for player.stop() to confirm
          // the native surface is detached before unmounting the player UI.
          break;
        }
        try {
          await this.player.stop();
        } catch (error) {
          this.callbacks.onEvent({
            kind: "error",
            message: error instanceof Error ? redactText(error.message) : "The player did not finish shutting down.",
          });
          await this.finish("error", event.snapshot ?? this.snapshot);
          break;
        }
        await this.finish(event.reason, event.snapshot ?? this.snapshot);
        break;
      case "first-frame":
        if (plan.delivery === "hls") this.confirmPlayMethod(attempt, plan);
        break;
      case "error":
        break;
    }
  }

  // Asks the server's session whether the conversion copies or encodes, at
  // most twice, in the background: nothing waits for it, and ending the
  // attempt aborts it. A failed or empty answer keeps the plan's label, so
  // "original quality" is shown only when the server says it copies.
  private confirmPlayMethod(attempt: number, plan: PlaybackPlan): void {
    if (!this.gateway.sessionPlayMethod || this.confirmController) return;
    const controller = new AbortController();
    this.confirmController = controller;
    void (async () => {
      let waited = 0;
      for (const at of PLAY_METHOD_CHECKS_MS) {
        if (!(await abortableDelay(at - waited, controller.signal))) return;
        waited = at;
        let server: ServerPlayMethod | undefined;
        try {
          server = await this.gateway.sessionPlayMethod!(plan, controller.signal);
        } catch {
          server = undefined;
        }
        if (controller.signal.aborted || attempt !== this.attempt || this.plan !== plan) return;
        const confirmed = server && confirmedPlan(plan, server);
        if (!confirmed) continue;
        this.plan = confirmed;
        if (this.previousPlan === plan) this.previousPlan = confirmed;
        this.callbacks.onPlanConfirmed?.(confirmed);
        return;
      }
    })();
  }

  private cancelPlayMethodCheck(): void {
    this.confirmController?.abort();
    this.confirmController = undefined;
  }

  private finish(
    reason: PlaybackEndReason | RestartReason,
    snapshot?: PlaybackSnapshot,
  ): Promise<void> {
    if (this.finishTask) return this.finishTask;
    if (!this.plan && !this.unsubscribe) return Promise.resolve();

    const task = this.finishSession(reason, snapshot);
    this.finishTask = task;
    void task.finally(() => {
      if (this.finishTask === task) this.finishTask = undefined;
    }).catch(() => undefined);
    return task;
  }

  private async finishSession(
    reason: PlaybackEndReason | RestartReason,
    snapshot?: PlaybackSnapshot,
  ): Promise<void> {
    const plan = this.plan;
    // An error ending is a failed session. Retry is offered only after a
    // playback error, so it ends a failed session too. A non-fatal error event
    // (for example one dropped render) followed by a normal ending is not.
    // A renegotiation is reported as failed on purpose: a Stopped report that
    // is not Failed updates the user's play state (SessionManager.cs
    // OnPlaybackStopped, v10.11.7 line 1115, v12.4 line 1176), so
    // a track or quality change past the resume cutoff would mark the item
    // played and count it again at the real end. The new session's progress
    // reports record the position instead.
    const failed = reason === "error" || reason === "retry" || reason === "renegotiate";
    this.reporter.finish(plan, snapshot, failed);
    this.disposeAttempt();
    this.plan = undefined;
    this.snapshot = undefined;
    switch (reason) {
      case "retry":
      case "renegotiate":
        // The item keeps playing in a new session.
        return;
      case "error":
        this.callbacks.onSessionEnded?.(reason);
        return;
      default:
        // A restart waiting on this session's stop must not launch.
        this.operation += 1;
        this.callbacks.onSessionEnded?.(reason);
        this.item = undefined;
        this.choice = undefined;
        this.previousPlan = undefined;
        this.selection = undefined;
    }
  }

  private resetAttempt(): void {
    this.cancelPlayMethodCheck();
    this.snapshot = undefined;
    this.reporter.reset();
  }

  private disposeAttempt(): void {
    this.cancelPlayMethodCheck();
    this.reporter.stopProgress();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private isCurrentAttempt(attempt: number, controller: AbortController): boolean {
    return attempt === this.attempt && !controller.signal.aborted;
  }

  private assertCurrentAttempt(attempt: number, controller: AbortController): void {
    if (!this.isCurrentAttempt(attempt, controller)) throw new PlaybackCancelledError();
  }

  private assertCurrentSession(operation: number, item: LibraryItem): void {
    if (operation !== this.operation || this.item !== item) throw new PlaybackCancelledError();
  }
}

function untilSettledOrAborted(promise: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => resolve();
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.finally(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }).catch(() => undefined);
  });
}

// Resolves true after `ms`, or false as soon as `signal` aborts.
function abortableDelay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
