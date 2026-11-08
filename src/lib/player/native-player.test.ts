import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnsupportedDeliveryError, type PlaybackPlan } from "../../domain/playback";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const { NativePlayerEngine } = await import("./native-player");

const plan: PlaybackPlan = {
  itemId: "item-1",
  title: "Movie",
  streamUrl: "https://media.test/Videos/item-1/stream?Static=true&MediaSourceId=s&PlaySessionId=p",
  authorization: 'MediaBrowser Client="Fluster", Token="secret"',
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
    await new NativePlayerEngine().launch(plan);
    const { authorization, ...launchPlan } = plan;
    expect(invoke.mock.calls).toEqual([
      ["launch_playback", { request: { plan: launchPlan, authorization, testForceSoftware: false } }],
    ]);
    const [, args] = invoke.mock.calls[0] as [string, { request: { plan: Record<string, unknown> } }];
    expect(args.request.plan).not.toHaveProperty("authorization");
    expect(JSON.stringify(args.request.plan)).not.toContain("secret");
  });

  // P10-04 wires the typed HLS path; until then no hls plan may reach Rust,
  // whose static path would treat the master URL as a file.
  it.each(["DirectStream", "Transcode"] as const)("refuses a %s plan before any invoke", async (playMethod) => {
    const hlsPlan: PlaybackPlan = {
      ...plan,
      streamUrl: "https://media.test/videos/item-1/master.m3u8?MediaSourceId=s&EnableTrickplay=false",
      delivery: "hls",
      playMethod,
      conversionReasons: ["ContainerNotSupported"],
    };
    const error = await new NativePlayerEngine().launch(hlsPlan).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnsupportedDeliveryError);
    expect(error).toMatchObject({ engine: "native", delivery: "hls" });
    expect((error as Error).message).not.toContain("media.test");
    expect(invoke).not.toHaveBeenCalled();
  });
});
