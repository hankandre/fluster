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
  private previousPlaySessionId?: string;
  private attemptController?: AbortController;
  private attemptTask?: Promise<PlaybackPlan>;
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

  async retry(): Promise<PlaybackPlan> {
    const item = this.item;
    const choice = this.choice;
    if (!item || !choice) throw new Error("There is no playback attempt to retry.");

    const operation = ++this.operation;
    this.cancelAttempt();
    await this.waitForAttempt();
    this.assertCurrentOperation(operation);
    await this.stopAttempt("retry");
    this.assertCurrentOperation(operation);
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
    await this.reporter.waitForDrains();
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
    if (isRetry && plan.playSessionId === this.previousPlaySessionId) {
      throw new Error("Jellyfin reused the failed playback session. Retry again to request a fresh session.");
    }

    const unsubscribe = await this.player.subscribe((event) => {
      this.eventQueue = this.eventQueue.then(() => this.handleEvent(attempt, event));
    });
    if (!this.isCurrentAttempt(attempt, controller)) {
      unsubscribe();
      throw new PlaybackCancelledError();
    }

    this.previousPlaySessionId = plan.playSessionId;
    this.plan = plan;
    this.unsubscribe = unsubscribe;
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
      }
      throw redactError(error);
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
      this.previousPlaySessionId = undefined;
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
