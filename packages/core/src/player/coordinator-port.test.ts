// T2-05 acceptance item 5: the coordinator's tests pass against a fake engine that implements only this port.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot } from "../domain/playback";
import { FakeClock } from "../ports/fake-clock";
import { PlaybackCancelledError, PlaybackCoordinator, type PlaybackGateway } from "./coordinator";
import { createFakePlayerEngine } from "./fake-player-engine";

const PORT_MEMBERS = ["initialize", "subscribe", "launch", "setPaused", "seek", "selectTrack", "stop"];

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };
const snapshot: PlaybackSnapshot = {
  positionSeconds: 42,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};
const signal = expect.any(AbortSignal);

function staticPlan(playSessionId: string): PlaybackPlan {
  return {
    itemId: "one",
    title: "One",
    streamUrl: `https://media.test/Videos/one/stream?Static=true&PlaySessionId=${playSessionId}`,
    mediaSourceId: "source",
    playSessionId,
    startPositionTicks: 0,
    tracks: [],
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
  };
}

function hlsPlan(playSessionId: string): PlaybackPlan {
  return {
    ...staticPlan(playSessionId),
    streamUrl: `https://media.test/videos/one/master.m3u8?PlaySessionId=${playSessionId}`,
    delivery: "hls",
    playMethod: "Transcode",
    conversionReasons: ["AudioCodecNotSupported"],
    serverUrl: "https://media.test",
    mediaKind: "videos",
  };
}

function setup(plans: PlaybackPlan[]) {
  const queue = [...plans];
  const gateway = {
    createPlaybackPlan: vi.fn<PlaybackGateway["createPlaybackPlan"]>(async () => queue.shift()!),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    sessionId: () => "session-1",
    stopActiveEncoding: vi.fn(async () => undefined),
  } satisfies PlaybackGateway;
  const fake = createFakePlayerEngine();
  const stop = vi.spyOn(fake.engine, "stop");
  const onSessionEnded = vi.fn();
  const coordinator = new PlaybackCoordinator(gateway, fake.engine, { onEvent: vi.fn(), onReportingError: vi.fn(), onSessionEnded }, new FakeClock());
  return { gateway, fake, stop, onSessionEnded, coordinator };
}

describe("the shared fake engine", () => {
  it("has exactly the port's members as its own keys", () => {
    const { engine } = createFakePlayerEngine();
    expect(Object.keys(engine).sort()).toEqual([...PORT_MEMBERS].sort());
    expect(Object.getOwnPropertyNames(engine).sort()).toEqual([...PORT_MEMBERS].sort());
  });

  it("imports no test library", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fake-player-engine.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["'](vitest|@vitest\/[^"']*)["']/);
  });
});

describe("coordinator tests use the port-only fake", () => {
  it("leaves no test that builds a coordinator on a hand-made or desktop-era engine", () => {
    const here = fileURLToPath(import.meta.url);
    const src = join(dirname(here), "..");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".test.ts")) files.push(path);
      }
    };
    walk(src);
    const builders = files
      .filter((file) => file !== here)
      .filter((file) => readFileSync(file, "utf8").includes("new PlaybackCoordinator("));
    expect(builders.length).toBeGreaterThanOrEqual(8);
    const banned = ["implements PlayerEngine", "as unknown as PlayerEngine", "setSurface", "setFullscreen", "setVolume", "setMuted", "authorizationHeader"];
    const offenders = builders.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      const problems = banned.filter((word) => text.includes(word));
      if (!text.includes("fake-player-engine")) problems.push("does not import fake-player-engine");
      return problems.map((problem) => `${relative(src, file)}: ${problem}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe("the coordinator against the port-only fake", () => {
  it("starts, reports the start, a pause and the end of the file", async () => {
    const plan = staticPlan("play-1");
    const { gateway, fake, stop, onSessionEnded, coordinator } = setup([plan]);
    await coordinator.start(item);
    expect(fake.launches).toHaveLength(1);
    fake.emit({ kind: "loaded", snapshot });
    fake.emit({ kind: "first-frame" });
    await coordinator.flush();
    expect(gateway.reportStart).toHaveBeenCalledWith(plan, snapshot, signal);
    fake.emit({ kind: "state", snapshot: { ...snapshot, paused: true }, cause: "pause" });
    await coordinator.flush();
    expect(gateway.reportProgress).toHaveBeenCalledWith(plan, { ...snapshot, paused: true }, signal);
    fake.emit({ kind: "ended", snapshot, reason: "eof" });
    await coordinator.flush();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, signal, false);
    expect(onSessionEnded).toHaveBeenCalledWith("eof");
  });

  it("stops on Stop and reports a normal stop", async () => {
    const plan = staticPlan("play-1");
    const { gateway, fake, stop, onSessionEnded, coordinator } = setup([plan]);
    await coordinator.start(item);
    fake.emit({ kind: "loaded", snapshot });
    await coordinator.flush();
    await coordinator.stop();
    await coordinator.flush();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(gateway.reportStopped).toHaveBeenCalledWith(plan, snapshot, signal, false);
    expect(onSessionEnded).toHaveBeenCalledWith("stopped");
  });

  it("retries an error with a fresh session and reports the failed one as failed", async () => {
    const first = staticPlan("play-1");
    const second = staticPlan("play-2");
    const { gateway, fake, coordinator } = setup([first, second]);
    await coordinator.start(item);
    fake.emit({ kind: "loaded", snapshot });
    fake.emit({ kind: "error", code: "network" });
    await coordinator.flush();
    const next = await coordinator.retry();
    await coordinator.flush();
    expect(next.playSessionId).toBe("play-2");
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
    expect(gateway.reportStopped).toHaveBeenCalledWith(first, snapshot, signal, true);
    expect(fake.launches).toHaveLength(2);
    expect(fake.launches[1]).toMatchObject({ kind: "original", url: second.streamUrl, sessionId: "session-1" });
  });

  it("renegotiates a converting session: stops it, reports it failed, deletes its encode and launches the new one", async () => {
    const first = hlsPlan("play-1");
    const second = hlsPlan("play-2");
    const { gateway, fake, onSessionEnded, coordinator } = setup([first, second]);
    await coordinator.start(item);
    fake.emit({ kind: "loaded", snapshot });
    await coordinator.flush();
    await coordinator.renegotiate(420_000_000, { audioStreamIndex: 2 });
    expect(gateway.reportStopped).toHaveBeenCalledWith(first, snapshot, signal, true);
    expect(gateway.stopActiveEncoding).toHaveBeenCalledWith("play-1", signal);
    expect(gateway.createPlaybackPlan).toHaveBeenLastCalledWith(item, 420_000_000, signal, { audioStreamIndex: 2, mediaSourceId: "source" });
    expect(fake.launches).toHaveLength(2);
    expect(fake.launches[1]).toMatchObject({ kind: "hls", masterUrl: second.streamUrl, serverUrl: "https://media.test", mediaKind: "videos" });
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("cancels a pending launch when Stop asks the engine to stop", async () => {
    const { fake, stop, coordinator } = setup([hlsPlan("play-1")]);
    let rejectLaunch: (error: Error) => void = () => undefined;
    const launch = vi.spyOn(fake.engine, "launch").mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectLaunch = reject; }));
    stop.mockImplementation(async () => rejectLaunch(new Error("The playback launch was cancelled.")));
    const starting = coordinator.start(item);
    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    await coordinator.stop();
    await expect(starting).rejects.toBeInstanceOf(PlaybackCancelledError);
    expect(stop).toHaveBeenCalled();
  });
});
