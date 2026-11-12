import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { PlaystateReporter, REPORT_FAILED_WARNING, type PlaystateGateway } from "./playstate-reporter";

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

// A converted session: its server encode must be stopped if the stopped
// report cannot do it.
const hlsPlan: PlaybackPlan = {
  ...plan,
  streamUrl: "https://media.test/videos/one/master.m3u8",
  playSessionId: "converting",
  delivery: "hls",
  playMethod: "Transcode",
  conversionReasons: ["ContainerBitrateExceedsLimit"],
  serverUrl: "https://media.test",
  mediaKind: "videos",
};

function recordingGateway(calls: string[]): PlaystateGateway {
  return {
    reportStart: vi.fn(async () => { calls.push("start"); }),
    reportProgress: vi.fn(async () => { calls.push("progress"); }),
    reportStopped: vi.fn(async (_plan, _snapshot, _signal, failed) => {
      calls.push(failed ? "stopped:failed" : "stopped");
    }),
    stopActiveEncoding: vi.fn(async () => { calls.push("delete"); }),
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
    expect(onWarning).toHaveBeenCalledWith(REPORT_FAILED_WARNING);
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

  describe("stopping the server encode of a converted session", () => {
    it("sends one DELETE after a failed stopped report", async () => {
      const calls: string[] = [];
      const gateway = recordingGateway(calls);
      gateway.reportStopped = vi.fn(async () => {
        calls.push("stopped:failed-request");
        throw new Error("Request failed with status code 500");
      });
      const reporter = new PlaystateReporter(gateway, vi.fn());

      reporter.start(hlsPlan, snapshot, () => snapshot);
      reporter.finish(hlsPlan, snapshot, false);
      await reporter.waitForDrains();

      expect(calls).toEqual(["start", "stopped:failed-request", "delete"]);
      expect(gateway.stopActiveEncoding).toHaveBeenCalledTimes(1);
      expect(gateway.stopActiveEncoding).toHaveBeenCalledWith("converting", expect.any(AbortSignal));
    });

    it("sends one DELETE after a stopped report times out, and bounds the DELETE too", async () => {
      vi.useFakeTimers();
      const calls: string[] = [];
      const gateway = recordingGateway(calls);
      gateway.reportStopped = vi.fn(() => new Promise<void>(() => undefined));
      let deleteSignal: AbortSignal | undefined;
      gateway.stopActiveEncoding = vi.fn((_id: string, signal?: AbortSignal) => {
        deleteSignal = signal;
        calls.push("delete");
        return new Promise<void>(() => undefined);
      });
      const onWarning = vi.fn();
      const reporter = new PlaystateReporter(gateway, onWarning);
      let drained = false;

      reporter.start(hlsPlan, snapshot, () => snapshot);
      reporter.finish(hlsPlan, snapshot, false);
      void reporter.waitForDrains().then(() => { drained = true; });
      await vi.advanceTimersByTimeAsync(4_999);
      expect(gateway.stopActiveEncoding).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toEqual(["start", "delete"]);
      expect(drained).toBe(false);

      await vi.advanceTimersByTimeAsync(3_000);
      expect(drained).toBe(true);
      expect(deleteSignal?.aborted).toBe(true);
      expect(gateway.stopActiveEncoding).toHaveBeenCalledTimes(1);
      expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("server conversion"));
    });

    it("sends no DELETE when the stopped report succeeds or the session direct played", async () => {
      const calls: string[] = [];
      const gateway = recordingGateway(calls);
      const reporter = new PlaystateReporter(gateway, vi.fn());

      reporter.start(hlsPlan, snapshot, () => snapshot);
      reporter.finish(hlsPlan, snapshot, false);
      await reporter.waitForDrains();
      gateway.reportStopped = vi.fn(async () => { throw new Error("offline"); });
      reporter.reset();
      reporter.start(plan, snapshot, () => snapshot);
      reporter.finish(plan, snapshot, false);
      reporter.stopEncoding(plan);
      await reporter.waitForDrains();

      expect(calls).toEqual(["start", "stopped", "start"]);
      expect(gateway.stopActiveEncoding).not.toHaveBeenCalled();
    });

    it("sends a DELETE when a converted session ends before its start was reported", async () => {
      const calls: string[] = [];
      const reporter = new PlaystateReporter(recordingGateway(calls), vi.fn());

      reporter.finish(hlsPlan, undefined, true);
      await reporter.waitForDrains();

      expect(calls).toEqual(["delete"]);
    });

    it("stops an encode for a new play session after the old stopped report, once per session", async () => {
      const calls: string[] = [];
      const gateway = recordingGateway(calls);
      const reporter = new PlaystateReporter(gateway, vi.fn());

      reporter.start(hlsPlan, snapshot, () => snapshot);
      reporter.finish(hlsPlan, snapshot, true);
      reporter.stopEncoding(hlsPlan);
      reporter.stopEncoding(hlsPlan);
      await reporter.waitForDrains();

      expect(calls).toEqual(["start", "stopped:failed", "delete"]);
    });

    // Fixture finding (plan 002, P10-07): a progress report pings the HLS job
    // (TranscodeManager.OnPlaybackProgress), and IsPaused=true stops the
    // server's own automatic progress, so these reports alone keep a paused
    // conversion alive past the 60 s kill timer. No separate ping is sent.
    it("keeps sending progress every 10 s while a conversion is paused", async () => {
      vi.useFakeTimers();
      const gateway = recordingGateway([]);
      const paused = { ...snapshot, paused: true };
      const reporter = new PlaystateReporter(gateway, vi.fn());

      reporter.start(hlsPlan, snapshot, () => paused);
      reporter.progress(hlsPlan, paused);
      await vi.advanceTimersByTimeAsync(90_000);

      expect(gateway.reportProgress).toHaveBeenCalledTimes(10);
      expect(vi.mocked(gateway.reportProgress).mock.calls.every(([, sent]) => sent.paused)).toBe(true);
      expect(gateway.stopActiveEncoding).not.toHaveBeenCalled();
      reporter.stopProgress();
    });

    it("turns a failed DELETE into a redacted warning", async () => {
      const gateway = recordingGateway([]);
      gateway.stopActiveEncoding = vi.fn(async () => {
        throw new Error("DELETE https://media.test/Videos/ActiveEncodings?api_key=secret failed");
      });
      const onWarning = vi.fn();
      const reporter = new PlaystateReporter(gateway, onWarning);

      reporter.stopEncoding(hlsPlan);
      await reporter.waitForDrains();

      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(onWarning.mock.calls[0][0]).not.toContain("secret");
    });
  });
});
