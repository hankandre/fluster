import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackRefusedError, type PlaybackPlan } from "../../domain/playback";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const { NativePlayerEngine, UNSAFE_CONVERSION_PREFIX } = await import("./native-player");

const authorization = 'MediaBrowser Client="Fluster", Token="secret"';
const readAuthorization = () => authorization;

const plan: PlaybackPlan = {
  itemId: "item-1",
  title: "Movie",
  streamUrl: "https://media.test/Videos/item-1/stream?Static=true&MediaSourceId=s&PlaySessionId=p",
  mediaSourceId: "s",
  playSessionId: "p",
  startPositionTicks: 0,
  tracks: [],
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};

beforeEach(() => invoke.mockReset());

describe("NativePlayerEngine", () => {
  it("sends the authorization header as its own typed launch field, never inside the plan", async () => {
    invoke.mockResolvedValue(undefined);
    await new NativePlayerEngine().launch(plan, readAuthorization);
    expect(invoke.mock.calls).toEqual([
      ["launch_playback", { request: { plan, authorization, testForceSoftware: false } }],
    ]);
    const [, args] = invoke.mock.calls[0] as [string, { request: { plan: Record<string, unknown> } }];
    expect(args.request.plan).not.toHaveProperty("authorization");
    expect(JSON.stringify(args.request.plan)).not.toContain("secret");
  });

  const hlsPlan: PlaybackPlan = {
    ...plan,
    streamUrl: "https://media.test/videos/item-1/master.m3u8?MediaSourceId=s&PlaySessionId=p&EnableTrickplay=false",
    delivery: "hls",
    playMethod: "Transcode",
    conversionReasons: ["ContainerBitrateExceedsLimit"],
    serverUrl: "https://media.test",
    mediaKind: "videos",
  };

  // P10-04: Rust validates the master URL and every playlist; the typed
  // delivery field and the server it is bound to travel with the plan.
  it.each(["DirectStream", "Transcode"] as const)("launches a %s plan through Rust's typed HLS path", async (playMethod) => {
    invoke.mockResolvedValue(undefined);
    await new NativePlayerEngine().launch({ ...hlsPlan, playMethod }, readAuthorization);
    const [command, args] = invoke.mock.calls[0] as [string, { request: { plan: Record<string, unknown>; authorization: string } }];
    expect(command).toBe("launch_playback");
    expect(args.request.plan).toMatchObject({ delivery: "hls", serverUrl: "https://media.test", mediaKind: "videos", playMethod });
    expect(args.request.authorization).toBe(authorization);
    expect(JSON.stringify(args.request.plan)).not.toContain("secret");
  });

  it("turns Rust's refusal of a converted stream into the unsafe-transcoding-url refusal, without its text", async () => {
    invoke.mockRejectedValueOnce(`${UNSAFE_CONVERSION_PREFIX} The conversion playlist carries a credential, so Fluster stopped before using it.`);
    const error = await new NativePlayerEngine().launch(hlsPlan, readAuthorization).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlaybackRefusedError);
    expect(error).toMatchObject({ reason: "unsafe-transcoding-url" });
    expect((error as Error).message).not.toContain("credential");
  });

  it("turns other launch failures into an Error with Rust's message", async () => {
    const reason = "Could not start the converted stream: Could not fetch the conversion playlist from the server.";
    invoke.mockRejectedValueOnce(reason);
    const error = await new NativePlayerEngine().launch(hlsPlan, readAuthorization).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PlaybackRefusedError);
    expect((error as Error).message).toBe(reason);
  });

  type Engine = InstanceType<typeof NativePlayerEngine>;
  const commands: [string, (engine: Engine) => Promise<unknown>][] = [
    ["initialize", (engine) => engine.initialize()],
    ["setSurface", (engine) => engine.setSurface({ x: 0, y: 0, width: 1, height: 1, scaleFactor: 1, visible: true })],
    ["launch", (engine) => engine.launch(plan, readAuthorization)],
    ["setPaused", (engine) => engine.setPaused(true)],
    ["seek", (engine) => engine.seek(5)],
    ["setVolume", (engine) => engine.setVolume(50)],
    ["setMuted", (engine) => engine.setMuted(true)],
    ["selectTrack", (engine) => engine.selectTrack("audio", 1)],
    ["setFullscreen", (engine) => engine.setFullscreen(true)],
    ["stop", (engine) => engine.stop()],
  ];

  it.each(commands)("%s turns a string rejection into an Error with that exact message", async (_name, run) => {
    invoke.mockRejectedValueOnce("The video surface is not ready.");
    const error = await run(new NativePlayerEngine()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("The video surface is not ready.");
  });

  it.each(commands)("%s rethrows an Error rejection as the same object", async (_name, run) => {
    const failure = new Error("The player could not pause.");
    invoke.mockRejectedValueOnce(failure);
    await expect(run(new NativePlayerEngine())).rejects.toBe(failure);
  });

  it.each(commands)("%s passes any other rejection through unchanged", async (_name, run) => {
    const failure = { code: 1 };
    invoke.mockRejectedValueOnce(failure);
    await expect(run(new NativePlayerEngine())).rejects.toBe(failure);
  });
});
