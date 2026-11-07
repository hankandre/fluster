import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { redactText } from "../redact";

const PROGRESS_INTERVAL_MS = 10_000;
const REPORT_FLUSH_TIMEOUT_MS = 5_000;

export interface PlaystateGateway {
  reportStart(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
  reportProgress(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
  reportStopped(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal, failed?: boolean): Promise<void>;
}

/**
 * Sends Jellyfin start, progress, and stopped reports for one playback attempt
 * at a time. Reports run in order, failures become warnings, and the final
 * drain after a stop is bounded so shutdown never waits on the server.
 */
export class PlaystateReporter {
  private queue: Promise<void> = Promise.resolve();
  private controller = new AbortController();
  private drains: Promise<void> = Promise.resolve();
  private progressTimer?: number;
  private started = false;

  constructor(
    private readonly gateway: PlaystateGateway,
    private readonly onWarning: (message: string) => void,
  ) {}

  /** Forget the previous attempt's reports. Earlier drains keep running. */
  reset(): void {
    this.queue = Promise.resolve();
    this.controller = new AbortController();
    this.started = false;
  }

  /**
   * Report the start once per attempt and begin periodic progress reports.
   * `currentSnapshot` is read on every progress tick.
   */
  start(
    plan: PlaybackPlan,
    snapshot: PlaybackSnapshot,
    currentSnapshot: () => PlaybackSnapshot | undefined,
  ): void {
    if (this.started) return;
    this.started = true;
    this.queueReport((signal) => this.gateway.reportStart(plan, snapshot, signal));
    this.progressTimer = window.setInterval(() => {
      const latest = currentSnapshot();
      if (latest && this.started) {
        this.queueReport((signal) => this.gateway.reportProgress(plan, latest, signal));
      }
    }, PROGRESS_INTERVAL_MS);
  }

  /** Report progress now. Ignored until the start has been reported. */
  progress(plan: PlaybackPlan, snapshot: PlaybackSnapshot): void {
    if (!this.started) return;
    this.queueReport((signal) => this.gateway.reportProgress(plan, snapshot, signal));
  }

  stopProgress(): void {
    if (this.progressTimer !== undefined) window.clearInterval(this.progressTimer);
    this.progressTimer = undefined;
  }

  /**
   * Report the stop (when a start was reported) and drain this attempt's
   * reports in the background, aborting them after the shutdown deadline.
   */
  finish(plan: PlaybackPlan | undefined, snapshot: PlaybackSnapshot | undefined, failed: boolean): void {
    this.stopProgress();
    if (plan && snapshot && this.started) {
      this.queueReport((signal) => this.gateway.reportStopped(plan, snapshot, signal, failed));
    }
    const drain = this.drain(this.queue, this.controller);
    this.drains = Promise.all([this.drains, drain]).then(() => undefined);
    this.started = false;
  }

  /** Resolves when every finished attempt has drained or hit its deadline. */
  waitForDrains(): Promise<void> {
    return this.drains;
  }

  /** Resolves when the current attempt's queued reports have settled. */
  waitForQueue(): Promise<void> {
    return this.queue;
  }

  private queueReport(operation: (signal: AbortSignal) => Promise<void>): void {
    const signal = this.controller.signal;
    this.queue = this.queue.then(() => operation(signal)).catch((error: unknown) => {
      if (signal.aborted) return;
      this.onWarning(error instanceof Error ? redactText(error.message) : "Playback reporting failed.");
    });
  }

  private async drain(queue: Promise<void>, controller: AbortController): Promise<void> {
    let timedOut = false;
    let timer: number | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = window.setTimeout(() => {
        timedOut = true;
        resolve();
      }, REPORT_FLUSH_TIMEOUT_MS);
    });
    await Promise.race([queue, deadline]);
    if (timer !== undefined) window.clearTimeout(timer);
    if (!timedOut) return;

    this.onWarning("Playback reports did not finish before the shutdown deadline.");
    controller.abort();
  }
}
