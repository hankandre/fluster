import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { PlaystateReporter, type PlaystateGateway } from "./playstate-reporter";

const plan: PlaybackPlan = {
  itemId: "one",
  title: "One",
  streamUrl: "https://media.test/video",
  authorization: 'MediaBrowser Token="secret"',
  mediaSourceId: "source",
  playSessionId: "session",
  startPositionTicks: 0,
  tracks: [],
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};
const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software — CPU", droppedFrames: 0 },
};

function recordingGateway(calls: string[]): PlaystateGateway {
  return {
    reportStart: vi.fn(async () => { calls.push("start"); }),
    reportProgress: vi.fn(async () => { calls.push("progress"); }),
    reportStopped: vi.fn(async (_plan, _snapshot, _signal, failed) => {
      calls.push(failed ? "stopped:failed" : "stopped");
    }),
  };
}

describe("PlaystateReporter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores progress and stop before the start is reported", async () => {
    const calls: string[] = [];
    const reporter = new PlaystateReporter(recordingGateway(calls), vi.fn());

    reporter.progress(plan, snapshot);
    reporter.finish(plan, snapshot, false);
    await reporter.waitForDrains();

    expect(calls).toEqual([]);
  });

  it("sends start, progress, and stopped in order and reports start once", async () => {
    const calls: string[] = [];
    const reporter = new PlaystateReporter(recordingGateway(calls), vi.fn());

    reporter.start(plan, snapshot, () => snapshot);
    reporter.start(plan, snapshot, () => snapshot);
    reporter.progress(plan, snapshot);
    reporter.finish(plan, snapshot, true);
    await reporter.waitForDrains();

    expect(calls).toEqual(["start", "progress", "stopped:failed"]);
  });

  it("sends periodic progress until stopped", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const reporter = new PlaystateReporter(recordingGateway(calls), vi.fn());

    reporter.start(plan, snapshot, () => snapshot);
    await vi.advanceTimersByTimeAsync(10_000);
    reporter.stopProgress();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls).toEqual(["start", "progress"]);
  });

  it("turns report failures into redacted warnings and keeps the queue going", async () => {
    const calls: string[] = [];
    const gateway = recordingGateway(calls);
    gateway.reportStart = vi.fn(async () => {
      throw new Error("failed https://media.test/Sessions/Playing?api_key=secret");
    });
    const onWarning = vi.fn();
    const reporter = new PlaystateReporter(gateway, onWarning);

    reporter.start(plan, snapshot, () => snapshot);
    reporter.progress(plan, snapshot);
    await reporter.waitForQueue();

    expect(calls).toEqual(["progress"]);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning.mock.calls[0][0]).not.toContain("secret");
  });

  it("aborts reports that outlive the shutdown deadline without a second warning", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const gateway = recordingGateway([]);
    gateway.reportStart = vi.fn((_plan, _snapshot, reportSignal?: AbortSignal) => {
      signal = reportSignal;
      return new Promise<void>((_resolve, reject) => {
        reportSignal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const onWarning = vi.fn();
    const reporter = new PlaystateReporter(gateway, onWarning);

    reporter.start(plan, snapshot, () => snapshot);
    reporter.finish(plan, snapshot, false);
    await vi.advanceTimersByTimeAsync(5_000);
    await reporter.waitForDrains();
    await reporter.waitForQueue();

    expect(signal?.aborted).toBe(true);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("shutdown deadline"));
  });

  it("sends the stopped report with a live signal after an earlier report hits the deadline", async () => {
    vi.useFakeTimers();
    const gateway = recordingGateway([]);
    gateway.reportStart = vi.fn((_plan, _snapshot, reportSignal?: AbortSignal) => new Promise<void>((_resolve, reject) => {
      reportSignal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    let stopSignalAborted: boolean | undefined;
    gateway.reportStopped = vi.fn(async (_plan, _snapshot, stopSignal?: AbortSignal) => {
      stopSignalAborted = stopSignal?.aborted;
    });
    const reporter = new PlaystateReporter(gateway, vi.fn());

    reporter.start(plan, snapshot, () => snapshot);
    reporter.finish(plan, snapshot, false);
    await vi.advanceTimersByTimeAsync(5_000);
    await reporter.waitForDrains();

    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), false);
    expect(stopSignalAborted).toBe(false);
  });

  it("bounds the stopped report with its own timeout when an earlier report ignores cancellation", async () => {
    vi.useFakeTimers();
    const gateway = recordingGateway([]);
    gateway.reportStart = vi.fn(() => new Promise<void>(() => undefined));
    let stopSignal: AbortSignal | undefined;
    gateway.reportStopped = vi.fn((_plan, _snapshot, reportSignal?: AbortSignal) => {
      stopSignal = reportSignal;
      return new Promise<void>(() => undefined);
    });
    const onWarning = vi.fn();
    const reporter = new PlaystateReporter(gateway, onWarning);
    let drained = false;

    reporter.start(plan, snapshot, () => snapshot);
    reporter.finish(plan, snapshot, true);
    void reporter.waitForDrains().then(() => { drained = true; });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, expect.any(AbortSignal), true);
    expect(drained).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(drained).toBe(true);
    expect(stopSignal?.aborted).toBe(true);
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("stopped report"));
  });
});
