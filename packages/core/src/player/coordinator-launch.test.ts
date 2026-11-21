// T2-05 acceptance item 2: the coordinator launches the engine with one typed request built from the plan and the
// gateway's session id. The gateway has no header to give, and nothing unsafe reaches the engine.
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan } from "../domain/playback";
import { FakeClock } from "../ports/fake-clock";
import { PlaybackCoordinator, type PlaybackGateway } from "./coordinator";
import { createFakePlayerEngine } from "./fake-player-engine";
import { LaunchRefusedError, launchRequest } from "./launch-request";

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };
const original: PlaybackPlan = {
  itemId: "one",
  title: "One",
  streamUrl: "https://media.test/Videos/one/stream?Static=true&PlaySessionId=play-1",
  mediaSourceId: "source",
  playSessionId: "play-1",
  startPositionTicks: 300_000_000,
  tracks: [{ index: 1, type: "Audio", displayTitle: "AAC", codec: "aac", external: false }],
  defaultAudioStreamIndex: 1,
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};
const converted: PlaybackPlan = {
  ...original,
  streamUrl: "https://media.test/videos/one/master.m3u8?PlaySessionId=play-1",
  delivery: "hls",
  playMethod: "Transcode",
  conversionReasons: ["AudioCodecNotSupported"],
  serverUrl: "https://media.test",
  mediaKind: "videos",
};

function setup(plan: PlaybackPlan, sessionId: () => string = () => "session-1") {
  const gateway = {
    createPlaybackPlan: vi.fn(async () => plan),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    sessionId: vi.fn(sessionId),
    stopActiveEncoding: vi.fn(async () => undefined),
  } satisfies PlaybackGateway;
  const fake = createFakePlayerEngine();
  const subscribe = vi.spyOn(fake.engine, "subscribe");
  const launch = vi.spyOn(fake.engine, "launch");
  const coordinator = new PlaybackCoordinator(gateway, fake.engine, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
  return { gateway, subscribe, launch, coordinator };
}

describe("the coordinator's launch request", () => {
  it("gives the gateway only the members the port needs: a session id, no header", () => {
    const { gateway } = setup(original);
    expect(Object.keys(gateway).sort()).toEqual(
      ["createPlaybackPlan", "reportProgress", "reportStart", "reportStopped", "sessionId", "stopActiveEncoding"],
    );
  });

  it.each([
    ["an original file", original],
    ["an HLS session", converted],
  ])("launches %s once, with exactly one argument: the typed request", async (_name, plan) => {
    const { coordinator, launch } = setup(plan);
    await coordinator.start(item);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0]).toHaveLength(1);
    expect(launch.mock.calls[0][0]).toEqual(launchRequest(plan, "session-1"));
  });

  it("refuses a plan with an unsafe URL before it subscribes, launches or reports", async () => {
    const { coordinator, gateway, subscribe, launch } = setup({ ...original, streamUrl: "https://media.test/Videos/one/stream?api_key=SECRET-TOKEN" });
    const error = await coordinator.start(item).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LaunchRefusedError);
    expect(String(error)).not.toContain("SECRET-TOKEN");
    await coordinator.flush();
    expect(subscribe).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    expect(gateway.reportStart).not.toHaveBeenCalled();
    expect(gateway.reportProgress).not.toHaveBeenCalled();
    expect(gateway.reportStopped).not.toHaveBeenCalled();
  });

  it("rejects start with the gateway's signed-out error and launches nothing", async () => {
    const { coordinator, gateway, subscribe, launch } = setup(original, () => {
      throw new Error("Sign in before using the library.");
    });
    await expect(coordinator.start(item)).rejects.toThrow("Sign in before using the library.");
    await coordinator.flush();
    expect(subscribe).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    expect(gateway.reportStart).not.toHaveBeenCalled();
    expect(gateway.reportStopped).not.toHaveBeenCalled();
  });
});
