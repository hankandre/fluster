import type { LibraryItem } from "../../domain/catalog";
import type {
  PlaybackEndReason,
  PlaybackPlan,
  PlaybackSnapshot,
  PlaybackStartChoice,
  PlayerEngine,
  PlayerEvent,
} from "../../domain/playback";
import { startOverChoice } from "../../domain/playback";
import { redactError, redactText } from "../redact";
import { PlaystateReporter, type PlaystateGateway } from "./playstate-reporter";

export interface PlaybackGateway extends PlaystateGateway {
  createPlaybackPlan(
    item: LibraryItem,
    startPositionTicks: number,
    signal?: AbortSignal,
    mediaSourceId?: string,
  ): Promise<PlaybackPlan>;
}

export interface CoordinatorCallbacks {
  onEvent(event: PlayerEvent): void;
  onReportingError(message: string): void;
  onSessionEnded?(reason: PlaybackEndReason): void;
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
  private attemptController?: AbortController;
  private attemptTask?: Promise<PlaybackPlan>;
  // The stop that cancelled a pending launch. Every later stop waits for it,
  // so it can never reach the engine after the next launch began.
  private cancelStop?: Promise<void>;
  private finishTask?: Promise<void>;
  private requestedStopReason?: "retry" | "stopped";
  private eventQueue: Promise<void> = Promise.resolve();
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
    return this.runAttempt(item, choice, false);
  }

  // Renegotiates the same item. `startPositionTicks` restarts from that
  // position (Play original uses the current one); omitted, it keeps the
  // original start choice.
  async retry(startPositionTicks?: number): Promise<PlaybackPlan> {
    const item = this.item;
    if (!item || !this.choice) throw new Error("There is no playback attempt to retry.");
    if (startPositionTicks !== undefined) {
      this.choice = { kind: "resume", startPositionTicks: Math.max(0, Math.floor(startPositionTicks)) };
    }
    const choice = this.choice;

    const operation = ++this.operation;
    this.cancelAttempt();
    await this.waitForAttempt();
    this.assertCurrentOperation(operation);
    await this.stopAttempt("retry");
    this.assertCurrentOperation(operation);
    // Retry, Play original, and track changes start a new play session, so a
    // converting one's server encode is stopped first. The new attempt waits
    // for it (bounded) before negotiating; Stop or Back cancels that wait.
    if (this.previousPlan) this.reporter.stopEncoding(this.previousPlan);
    return this.runAttempt(item, choice, true);
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
    try {
      plan = await this.gateway.createPlaybackPlan(
        item,
        choice.startPositionTicks,
        controller.signal,
      );
    } catch (error) {
      if (!this.isCurrentAttempt(attempt, controller)) throw new PlaybackCancelledError();
      throw redactError(error);
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

  private async stopAttempt(reason: "retry" | "stopped"): Promise<void> {
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
        this.reporter.start(plan, event.snapshot, () => this.snapshot);
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
      case "error":
      case "first-frame":
        break;
    }
  }

  private finish(
    reason: PlaybackEndReason | "retry",
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
    reason: PlaybackEndReason | "retry",
    snapshot?: PlaybackSnapshot,
  ): Promise<void> {
    const plan = this.plan;
    // Only an error ending is a failed session. Retry is offered only after a
    // playback error, so it ends a failed session too. A non-fatal error event
    // (for example one dropped render) followed by a normal ending is not.
    const failed = reason === "error" || reason === "retry";
    this.reporter.finish(plan, snapshot, failed);
    this.disposeAttempt();
    this.plan = undefined;
    this.snapshot = undefined;
    if (reason !== "retry") this.callbacks.onSessionEnded?.(reason);
    if (reason !== "error" && reason !== "retry") {
      this.item = undefined;
      this.choice = undefined;
      this.previousPlan = undefined;
    }
  }

  private resetAttempt(): void {
    this.snapshot = undefined;
    this.reporter.reset();
  }

  private disposeAttempt(): void {
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

  private assertCurrentOperation(operation: number): void {
    if (operation !== this.operation) throw new PlaybackCancelledError();
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
