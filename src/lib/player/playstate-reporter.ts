import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { redactText } from "../redact";

const PROGRESS_INTERVAL_MS = 10_000;
const REPORT_FLUSH_TIMEOUT_MS = 5_000;
const STOPPED_REPORT_TIMEOUT_MS = 5_000;
const ENCODING_STOP_TIMEOUT_MS = 3_000;

export interface PlaystateGateway {
  reportStart(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
  reportProgress(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
  reportStopped(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal, failed?: boolean): Promise<void>;
  // DELETE /Videos/ActiveEncodings for one play session's server conversion.
  stopActiveEncoding(playSessionId: string, signal?: AbortSignal): Promise<void>;
}

/**
 * Sends Jellyfin start, progress, and stopped reports for one playback attempt
 * at a time. Reports run in order, failures become warnings, and the final
 * drain after a stop is bounded so shutdown never waits on the server: earlier
 * reports get REPORT_FLUSH_TIMEOUT_MS, then the stopped report gets its own
 * signal and STOPPED_REPORT_TIMEOUT_MS.
 *
 * For a converted (HLS) session it also stops the server's encode with one
 * bounded DELETE /Videos/ActiveEncodings when the stopped report failed, timed
 * out, or was never sent, and when the coordinator starts a new play session
 * for the item (`stopEncoding`). Each play session gets at most one DELETE.
 * These run inside the drains, so they are bounded like the reports and
 * nothing that leaves the player waits for them.
 */
export class PlaystateReporter {
  private queue: Promise<void> = Promise.resolve();
  private controller = new AbortController();
  private drains: Promise<void> = Promise.resolve();
  private progressTimer?: ReturnType<typeof setInterval>;
  private started = false;
  // Play sessions whose encode has been asked to stop. Kept in memory only.
  private readonly stoppedEncodings = new Set<string>();

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
    this.progressTimer = setInterval(() => {
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
    if (this.progressTimer !== undefined) clearInterval(this.progressTimer);
    this.progressTimer = undefined;
  }

  /**
   * Drain this attempt's reports in the background, then report the stop
   * (when a start was reported). Each step has its own deadline, so a hung
   * earlier report cannot cancel or block the stopped report.
   */
  finish(plan: PlaybackPlan | undefined, snapshot: PlaybackSnapshot | undefined, failed: boolean): void {
    this.stopProgress();
    let sendStopped: ((signal: AbortSignal) => Promise<void>) | undefined;
    if (plan && snapshot && this.started) {
      sendStopped = (signal) => this.gateway.reportStopped(plan, snapshot, signal, failed);
    }
    const drain = this.drain(this.queue, this.controller, sendStopped, plan);
    this.drains = Promise.all([this.drains, drain]).then(() => undefined);
    this.started = false;
  }

  /**
   * Stop a converted session's server encode before a new play session for
   * the same item (retry, quality or track change). It runs after the drains
   * already queued, so the old stopped report goes first, and the next
   * negotiation waits for it through `waitForDrains`.
   */
  stopEncoding(plan: PlaybackPlan): void {
    if (plan.delivery !== "hls") return;
    this.drains = this.drains.then(() => this.sendEncodingStop(plan));
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

  private async drain(
    queue: Promise<void>,
    controller: AbortController,
    sendStopped: ((signal: AbortSignal) => Promise<void>) | undefined,
    plan: PlaybackPlan | undefined,
  ): Promise<void> {
    const settled = await settlesWithin(queue, REPORT_FLUSH_TIMEOUT_MS);
    if (!settled) {
      this.onWarning("Playback reports did not finish before the shutdown deadline.");
      controller.abort();
    }
    const stopped = sendStopped ? await this.sendStoppedReport(sendStopped) : false;
    // A delivered stopped report kills the session's jobs on the server
    // (PlaystateController.cs v10.11.7 lines 249-253). Without one, ask for it.
    if (!stopped && plan) await this.sendEncodingStop(plan);
  }

  /** Resolves true only when the stopped report succeeded in time. */
  private async sendStoppedReport(sendStopped: (signal: AbortSignal) => Promise<void>): Promise<boolean> {
    const controller = new AbortController();
    let delivered = false;
    const report = sendStopped(controller.signal).then(() => {
      delivered = true;
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      this.onWarning(error instanceof Error ? redactText(error.message) : "Playback reporting failed.");
    });
    const settled = await settlesWithin(report, STOPPED_REPORT_TIMEOUT_MS);
    if (settled) return delivered;

    this.onWarning("The stopped report did not finish before the shutdown deadline.");
    controller.abort();
    return false;
  }

  // One bounded DELETE per converted play session. Never rejects.
  private async sendEncodingStop(plan: PlaybackPlan): Promise<void> {
    if (plan.delivery !== "hls" || this.stoppedEncodings.has(plan.playSessionId)) return;
    this.stoppedEncodings.add(plan.playSessionId);
    const controller = new AbortController();
    const request = this.gateway.stopActiveEncoding(plan.playSessionId, controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      this.onWarning(error instanceof Error ? redactText(error.message) : "Stopping the server conversion failed.");
    });
    const settled = await settlesWithin(request, ENCODING_STOP_TIMEOUT_MS);
    if (settled) return;

    this.onWarning("Stopping the server conversion did not finish before the shutdown deadline.");
    controller.abort();
  }
}

/** Resolves true when `promise` settles first, or false after `timeoutMs`. */
async function settlesWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const settled = await Promise.race([promise.then(() => true), deadline]);
  if (timer !== undefined) clearTimeout(timer);
  return settled;
}
