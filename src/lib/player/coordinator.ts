import type {
  LibraryItem,
  PlaybackEndReason,
  PlaybackPlan,
  PlaybackSnapshot,
  PlaybackStartChoice,
  PlayerEngine,
  PlayerEvent,
} from "../../domain/playback";
import { startOverChoice } from "../../domain/playback";

const PROGRESS_INTERVAL_MS = 10_000;
const REPORT_FLUSH_TIMEOUT_MS = 5_000;

export interface PlaybackGateway {
  createPlaybackPlan(
    item: LibraryItem,
    startPositionTicks: number,
    signal?: AbortSignal,
  ): Promise<PlaybackPlan>;
  reportStart(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
  reportProgress(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
  reportStopped(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
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
  private progressTimer?: number;
  private didReportStart = false;
  private attempt = 0;
  private operation = 0;
  private previousPlaySessionId?: string;
  private attemptController?: AbortController;
  private attemptTask?: Promise<PlaybackPlan>;
  private finishTask?: Promise<void>;
  private requestedStopReason?: "retry" | "stopped";
  private eventQueue: Promise<void> = Promise.resolve();
  private reportQueue: Promise<void> = Promise.resolve();
  private reportFlush: Promise<void> = Promise.resolve();
  private reportController = new AbortController();

  constructor(
    private readonly gateway: PlaybackGateway,
    private readonly player: PlayerEngine,
    private readonly callbacks: CoordinatorCallbacks,
  ) {}

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
    await this.reportFlush;
    if (this.plan || this.unsubscribe) await this.reportQueue;
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
    await this.reportFlush;
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
      throw error;
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
        this.disposeAttempt();
        this.plan = undefined;
      }
      throw error;
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
    this.clearProgressTimer();
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
    this.callbacks.onEvent(event);
    if ("snapshot" in event && event.snapshot) this.snapshot = event.snapshot;
    const plan = this.plan;
    if (!plan) return;

    switch (event.kind) {
      case "loaded":
        if (!this.didReportStart) {
          this.didReportStart = true;
          this.queueReport((signal) => this.gateway.reportStart(plan, event.snapshot, signal));
          this.progressTimer = window.setInterval(() => {
            const snapshot = this.snapshot;
            const currentPlan = this.plan;
            if (snapshot && currentPlan && this.didReportStart) {
              this.queueReport((signal) => this.gateway.reportProgress(currentPlan, snapshot, signal));
            }
          }, PROGRESS_INTERVAL_MS);
        }
        break;
      case "tracks-changed":
        if (this.didReportStart) {
          this.queueReport((signal) => this.gateway.reportProgress(plan, event.snapshot, signal));
        }
        break;
      case "state":
        if (this.didReportStart && (event.cause === "pause" || event.cause === "seek")) {
          this.queueReport((signal) => this.gateway.reportProgress(plan, event.snapshot, signal));
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
            message: error instanceof Error ? error.message : "The player did not finish shutting down.",
          });
          await this.finish("error", event.snapshot ?? this.snapshot);
          break;
        }
        await this.finish(event.reason, event.snapshot ?? this.snapshot);
        break;
      case "first-frame":
      case "error":
        break;
    }
  }

  private queueReport(operation: (signal: AbortSignal) => Promise<void>): void {
    const signal = this.reportController.signal;
    this.reportQueue = this.reportQueue.then(() => operation(signal)).catch((error: unknown) => {
      if (signal.aborted) return;
      this.callbacks.onReportingError(
        error instanceof Error ? error.message : "Playback reporting failed.",
      );
    });
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
    this.clearProgressTimer();
    const plan = this.plan;
    if (plan && snapshot && this.didReportStart) {
      this.queueReport((signal) => this.gateway.reportStopped(plan, snapshot, signal));
    }
    const reportQueue = this.reportQueue;
    const reportController = this.reportController;
    this.startReportDrain(reportQueue, reportController);
    this.disposeAttempt();
    this.plan = undefined;
    this.snapshot = undefined;
    this.didReportStart = false;
    if (reason !== "retry") this.callbacks.onSessionEnded?.(reason);
    if (reason !== "error" && reason !== "retry") {
      this.item = undefined;
      this.choice = undefined;
      this.previousPlaySessionId = undefined;
    }
  }

  private startReportDrain(
    reportQueue: Promise<void>,
    reportController: AbortController,
  ): void {
    const drain = this.drainReports(reportQueue, reportController);
    this.reportFlush = Promise.all([this.reportFlush, drain]).then(() => undefined);
  }

  private async drainReports(
    reportQueue: Promise<void>,
    reportController: AbortController,
  ): Promise<void> {
    let timedOut = false;
    let timer: number | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = window.setTimeout(() => {
        timedOut = true;
        resolve();
      }, REPORT_FLUSH_TIMEOUT_MS);
    });
    await Promise.race([reportQueue, deadline]);
    if (timer !== undefined) window.clearTimeout(timer);
    if (!timedOut) return;

    this.callbacks.onReportingError("Playback reports did not finish before the shutdown deadline.");
    reportController.abort();
  }

  private resetAttempt(): void {
    this.snapshot = undefined;
    this.didReportStart = false;
    this.reportQueue = Promise.resolve();
    this.reportController = new AbortController();
  }

  private clearProgressTimer(): void {
    if (this.progressTimer !== undefined) window.clearInterval(this.progressTimer);
    this.progressTimer = undefined;
  }

  private disposeAttempt(): void {
    this.clearProgressTimer();
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
