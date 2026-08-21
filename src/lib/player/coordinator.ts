import type { JellyfinGateway } from "../jellyfin/gateway";
import type {
  LibraryItem,
  PlaybackPlan,
  PlaybackSnapshot,
  PlaybackStartChoice,
  PlayerEngine,
  PlayerEvent,
} from "../../domain/playback";
import { startOverChoice } from "../../domain/playback";

export interface CoordinatorCallbacks {
  onEvent(event: PlayerEvent): void;
  onReportingError(message: string): void;
  onSessionEnded?(reason: string): void;
}

export class PlaybackCoordinator {
  private item?: LibraryItem;
  private choice?: PlaybackStartChoice;
  private plan?: PlaybackPlan;
  private snapshot?: PlaybackSnapshot;
  private unsubscribe?: () => void;
  private progressTimer?: number;
  private didReportStart = false;
  private finishing = false;
  private attempt = 0;
  private previousPlaySessionId?: string;
  private eventQueue: Promise<void> = Promise.resolve();
  private reportQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly gateway: JellyfinGateway,
    private readonly player: PlayerEngine,
    private readonly callbacks: CoordinatorCallbacks,
  ) {}

  async start(item: LibraryItem, choice: PlaybackStartChoice = startOverChoice()): Promise<PlaybackPlan> {
    if (this.plan || this.unsubscribe) throw new Error("Another item is already playing.");
    this.item = item;
    this.choice = choice;
    return this.beginAttempt(item, choice);
  }

  async retry(): Promise<PlaybackPlan> {
    if (!this.item || !this.choice) throw new Error("There is no playback attempt to retry.");
    // Ignore the old engine's final "stopped" event so retry cannot navigate
    // back to the library while the replacement attempt is starting.
    this.attempt += 1;
    await this.stopAttempt("retry");
    return this.beginAttempt(this.item, this.choice, true);
  }

  async stop(): Promise<void> {
    await this.stopAttempt("stopped");
    this.item = undefined;
    this.choice = undefined;
  }

  async flush(): Promise<void> {
    await this.eventQueue;
    await this.reportQueue;
  }

  private async beginAttempt(
    item: LibraryItem,
    choice: PlaybackStartChoice,
    isRetry = false,
  ): Promise<PlaybackPlan> {
    const attempt = ++this.attempt;
    this.resetAttempt();
    // PlaybackInfo is intentionally negotiated for every attempt. The resulting
    // authenticated URL and play-session identity are never retained for retry.
    const plan = await this.gateway.createPlaybackPlan(item, choice.startPositionTicks);
    if (isRetry && plan.playSessionId === this.previousPlaySessionId) {
      throw new Error("Jellyfin reused the failed playback session. Retry again to request a fresh session.");
    }
    this.previousPlaySessionId = plan.playSessionId;
    this.plan = plan;
    this.unsubscribe = await this.player.subscribe((event) => {
      this.eventQueue = this.eventQueue.then(() => this.handleEvent(attempt, event));
    });
    try {
      await this.player.launch(plan);
      return plan;
    } catch (error) {
      this.disposeAttempt();
      this.plan = undefined;
      throw error;
    }
  }

  private async stopAttempt(reason: string): Promise<void> {
    const hadAttempt = Boolean(this.plan || this.unsubscribe);
    if (!hadAttempt) return;
    this.clearProgressTimer();
    try {
      await this.player.stop();
    } catch {
      // Failed loads and normal EOF may already have released the native handle.
      // The final Jellyfin report still flushes from the last snapshot.
    }
    await this.eventQueue;
    await this.finish(reason, this.snapshot);
  }

  private async handleEvent(attempt: number, event: PlayerEvent): Promise<void> {
    if (attempt !== this.attempt) return;
    this.callbacks.onEvent(event);
    if ("snapshot" in event && event.snapshot) this.snapshot = event.snapshot;
    const plan = this.plan;
    if (!plan) return;

    if (event.kind === "loaded" && !this.didReportStart) {
      this.didReportStart = true;
      await this.queueReport(() => this.gateway.reportStart(plan, event.snapshot));
      this.progressTimer = window.setInterval(() => {
        const snapshot = this.snapshot;
        const currentPlan = this.plan;
        if (snapshot && currentPlan && this.didReportStart) {
          void this.queueReport(() => this.gateway.reportProgress(currentPlan, snapshot));
        }
      }, 10_000);
    } else if (
      event.kind === "tracks-changed" ||
      (event.kind === "state" && (event.cause === "pause" || event.cause === "seek"))
    ) {
      if (this.didReportStart) {
        await this.queueReport(() => this.gateway.reportProgress(plan, event.snapshot));
      }
    } else if (event.kind === "ended") {
      await this.finish(event.reason, event.snapshot ?? this.snapshot);
    }
  }

  private queueReport(operation: () => Promise<void>): Promise<void> {
    this.reportQueue = this.reportQueue.then(operation).catch((error: unknown) => {
      this.callbacks.onReportingError(
        error instanceof Error ? error.message : "Playback reporting failed.",
      );
    });
    return this.reportQueue;
  }

  private async finish(reason: string, snapshot?: PlaybackSnapshot): Promise<void> {
    if (!this.plan && !this.unsubscribe) return;
    if (this.finishing) {
      await this.reportQueue;
      return;
    }
    this.finishing = true;
    this.clearProgressTimer();
    const plan = this.plan;
    if (plan && snapshot && this.didReportStart) {
      await this.queueReport(() => this.gateway.reportStopped(plan, snapshot));
    }
    await this.reportQueue;
    this.disposeAttempt();
    this.plan = undefined;
    this.snapshot = undefined;
    this.didReportStart = false;
    this.finishing = false;
    if (reason !== "retry") this.callbacks.onSessionEnded?.(reason);
  }

  private resetAttempt(): void {
    this.snapshot = undefined;
    this.didReportStart = false;
    this.finishing = false;
    this.reportQueue = Promise.resolve();
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
}
