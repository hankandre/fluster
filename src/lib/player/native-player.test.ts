import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackPlan } from "../../domain/playback";

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
});
