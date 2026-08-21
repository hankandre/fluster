import type { JellyfinGateway } from "../jellyfin/gateway";
import type {
  LibraryItem,
  PlaybackPlan,
  PlaybackSnapshot,
  PlayerEngine,
  PlayerEvent,
} from "../../domain/playback";

export interface CoordinatorCallbacks {
  onEvent(event: PlayerEvent): void;
  onReportingError(message: string): void;
}

export class PlaybackCoordinator {
  private plan?: PlaybackPlan;
  private snapshot?: PlaybackSnapshot;
  private unsubscribe?: () => void;
  private progressTimer?: number;
  private didReportStart = false;
  private finishing = false;
  private eventQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly gateway: JellyfinGateway,
    private readonly player: PlayerEngine,
    private readonly callbacks: CoordinatorCallbacks,
  ) {}

  async start(item: LibraryItem, startPositionTicks = 0): Promise<PlaybackPlan> {
    if (this.plan) throw new Error("Another item is already playing.");
    this.plan = await this.gateway.createPlaybackPlan(item, startPositionTicks);
    this.unsubscribe = await this.player.subscribe((event) => {
      this.eventQueue = this.eventQueue.then(() => this.handleEvent(event));
    });
    try {
      await this.player.launch(this.plan);
      return this.plan;
    } catch (error) {
      this.dispose();
      this.plan = undefined;
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.player.stop();
    await this.eventQueue;
    if (this.plan && this.snapshot) await this.finish(this.snapshot);
  }

  private async handleEvent(event: PlayerEvent): Promise<void> {
    this.callbacks.onEvent(event);
    if ("snapshot" in event && event.snapshot) this.snapshot = event.snapshot;
    const plan = this.plan;
    if (!plan) return;
    try {
      if (event.kind === "loaded") {
        if (!this.didReportStart) {
          await this.gateway.reportStart(plan, event.snapshot);
          this.didReportStart = true;
          this.progressTimer = window.setInterval(() => void this.reportProgress(), 10_000);
        }
      } else if (event.kind === "state" && (event.cause === "pause" || event.cause === "seek")) {
        await this.gateway.reportProgress(plan, event.snapshot);
      } else if (event.kind === "ended") {
        await this.finish(event.snapshot ?? this.snapshot);
      }
    } catch (error) {
      this.callbacks.onReportingError(error instanceof Error ? error.message : "Playback reporting failed.");
    }
  }

  private async reportProgress(): Promise<void> {
    if (!this.plan || !this.snapshot || !this.didReportStart) return;
    try {
      await this.gateway.reportProgress(this.plan, this.snapshot);
    } catch (error) {
      this.callbacks.onReportingError(error instanceof Error ? error.message : "Playback progress could not be reported.");
    }
  }

  private async finish(snapshot?: PlaybackSnapshot): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    try {
      if (this.plan && snapshot && this.didReportStart) await this.gateway.reportStopped(this.plan, snapshot);
    } finally {
      this.dispose();
      this.plan = undefined;
      this.snapshot = undefined;
      this.didReportStart = false;
      this.finishing = false;
    }
  }

  private dispose(): void {
    if (this.progressTimer !== undefined) window.clearInterval(this.progressTimer);
    this.progressTimer = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
