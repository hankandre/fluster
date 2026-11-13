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

  it("passes other launch failures through unchanged", async () => {
    invoke.mockRejectedValueOnce("Could not start the converted stream: Could not fetch the conversion playlist from the server.");
    await expect(new NativePlayerEngine().launch(hlsPlan, readAuthorization)).rejects.toBe(
      "Could not start the converted stream: Could not fetch the conversion playlist from the server.",
    );
  });
});
