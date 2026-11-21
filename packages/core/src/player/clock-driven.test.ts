// T2-03 acceptance item 2: time comes only from an injected Clock. The coordinator's play-method checks and the
// reporter's progress interval and drain deadlines are driven by a FakeClock, with no real waiting.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEngine, PlayerEvent } from "../domain/playback";
import { FakeClock } from "../ports/fake-clock";
import { PlaybackCoordinator, type PlaybackGateway } from "./coordinator";
import { PlaystateReporter, type PlaystateGateway } from "./playstate-reporter";

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };
const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software — CPU", droppedFrames: 0 },
};
const pausedSnapshot: PlaybackSnapshot = { ...snapshot, paused: true };
const converted: PlaybackPlan = {
  itemId: "one",
  title: "One",
  streamUrl: "https://media.test/videos/one/master.m3u8",
  mediaSourceId: "source",
  playSessionId: "session",
  startPositionTicks: 0,
  tracks: [],
  delivery: "hls",
  playMethod: "Transcode",
  conversionReasons: ["DirectPlayError"],
  serverUrl: "https://media.test",
  mediaKind: "videos",
};

class FakePlayer implements PlayerEngine {
  mode = "native" as const;
  listener?: (event: PlayerEvent) => void;
  initialize = vi.fn(async () => ({ mode: "native" as const, embedded: true, renderer: "test", nativeRenderer: "test" }));
  subscribe = vi.fn(async (listener: (event: PlayerEvent) => void) => { this.listener = listener; return () => undefined; });
  setSurface = vi.fn(async () => undefined);
  launch = vi.fn(async () => undefined);
  setPaused = vi.fn(async () => undefined);
  seek = vi.fn(async () => undefined);
  setVolume = vi.fn(async () => undefined);
  setMuted = vi.fn(async () => undefined);
  selectTrack = vi.fn(async () => undefined);
  setFullscreen = vi.fn(async () => undefined);
  stop = vi.fn<() => Promise<void>>(async () => undefined);
}

function coordinatorSetup() {
  const clock = new FakeClock();
  const gateway = {
    createPlaybackPlan: vi.fn(async () => converted),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    authorizationHeader: () => "test-header",
    stopActiveEncoding: vi.fn(async () => undefined),
    // The server has no TranscodingInfo yet, so both checks run.
    sessionPlayMethod: vi.fn(async () => undefined),
  } satisfies PlaybackGateway;
  const player = new FakePlayer();
  const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn(), onPlanConfirmed: vi.fn() }, clock);
  return { clock, gateway, player, coordinator };
}

function reporterGateway(): PlaystateGateway {
  return {
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    stopActiveEncoding: vi.fn(async () => undefined),
  };
}

describe("play-method checks on a fake clock", () => {
  it("asks the server at 3 000 ms and 10 000 ms after the first frame, and never again", async () => {
    const { clock, gateway, player, coordinator } = coordinatorSetup();
    await coordinator.start(item);
    player.listener?.({ kind: "loaded", snapshot });
    player.listener?.({ kind: "first-frame" });
    await clock.advance(0);

    await clock.advance(2_999);
    expect(gateway.sessionPlayMethod).not.toHaveBeenCalled();
    await clock.advance(1);
    expect(gateway.sessionPlayMethod).toHaveBeenCalledTimes(1);
    await clock.advance(6_999);
    expect(gateway.sessionPlayMethod).toHaveBeenCalledTimes(1);
    await clock.advance(1);
    expect(gateway.sessionPlayMethod).toHaveBeenCalledTimes(2);
    await clock.advance(60_000);
    expect(gateway.sessionPlayMethod).toHaveBeenCalledTimes(2);
  });
});

describe("progress reports on a fake clock", () => {
  it("reports every 10 000 ms, also while paused, and stops with stopProgress", async () => {
    const clock = new FakeClock();
    const gateway = reporterGateway();
    const reporter = new PlaystateReporter(gateway, vi.fn(), clock);
    let current = snapshot;

    reporter.start(converted, snapshot, () => current);
    await clock.advance(9_999);
    expect(gateway.reportProgress).not.toHaveBeenCalled();
    await clock.advance(1);
    expect(gateway.reportProgress).toHaveBeenCalledTimes(1);
    current = pausedSnapshot;
    await clock.advance(10_000);
    expect(gateway.reportProgress).toHaveBeenCalledTimes(2);
    expect(gateway.reportProgress).toHaveBeenLastCalledWith(converted, pausedSnapshot, expect.any(AbortSignal));

    reporter.stopProgress();
    await clock.advance(60_000);
    expect(gateway.reportProgress).toHaveBeenCalledTimes(2);
  });

  it("sends the stopped report after the 5 000 ms flush deadline when an earlier report hangs", async () => {
    const clock = new FakeClock();
    const gateway = reporterGateway();
    gateway.reportStart = vi.fn((_plan, _snapshot, signal?: AbortSignal) => new Promise<void>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    let stopSignalAborted: boolean | undefined;
    gateway.reportStopped = vi.fn(async (_plan, _snapshot, signal?: AbortSignal) => {
      stopSignalAborted = signal?.aborted;
    });
    const reporter = new PlaystateReporter(gateway, vi.fn(), clock);

    reporter.start(converted, snapshot, () => snapshot);
    reporter.finish(converted, snapshot, false);
    await clock.advance(4_999);
    expect(gateway.reportStopped).not.toHaveBeenCalled();
    await clock.advance(1);
    await reporter.waitForDrains();

    expect(gateway.reportStopped).toHaveBeenCalledWith(converted, snapshot, expect.any(AbortSignal), false);
    expect(stopSignalAborted).toBe(false);
  });
});

describe("core tests and the fake clock", () => {
  it("leaves no core test outside adapters/ on the library's fake timers", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = join(here, "..");
    const needle = "vi.useFake" + "Timers(";
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".test.ts")) files.push(path);
      }
    };
    walk(src);
    const offenders = files
      .filter((file) => !relative(src, file).startsWith(`adapters${sep}`))
      .filter((file) => file !== fileURLToPath(import.meta.url))
      .filter((file) => readFileSync(file, "utf8").includes(needle))
      .map((file) => relative(src, file));
    expect(files.length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});
