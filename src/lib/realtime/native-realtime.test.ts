import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEvent } from "../../domain/realtime";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (...args: unknown[]) => listen(...args) }));

const { NativeRealtime } = await import("./native-realtime");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  invoke.mockReset();
  listen.mockReset();
});

describe("NativeRealtime", () => {
  it("invokes the two typed realtime commands", async () => {
    invoke.mockResolvedValue(undefined);
    const realtime = new NativeRealtime();
    await realtime.connect("https://media.test", 'MediaBrowser Token="t"');
    await realtime.disconnect();
    expect(invoke.mock.calls).toEqual([
      ["realtime_connect", { serverUrl: "https://media.test", authorization: 'MediaBrowser Token="t"' }],
      ["realtime_disconnect"],
    ]);
  });

  it("runs commands strictly in call order", async () => {
    const slowConnect = deferred();
    invoke.mockImplementation((command: string) =>
      command === "realtime_connect" ? slowConnect.promise : Promise.resolve(),
    );
    const realtime = new NativeRealtime();
    const connecting = realtime.connect("https://media.test", "h");
    const disconnecting = realtime.disconnect();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledTimes(1);
    slowConnect.resolve();
    await Promise.all([connecting, disconnecting]);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["realtime_connect", "realtime_disconnect"]);
  });

  it("keeps going after a rejected command", async () => {
    invoke.mockRejectedValueOnce(new Error("The server URL is not allowed.")).mockResolvedValue(undefined);
    const realtime = new NativeRealtime();
    await expect(realtime.connect("http://remote.test", "h")).rejects.toThrow("not allowed");
    await expect(realtime.disconnect()).resolves.toBeUndefined();
  });

  it("forwards server events from the fluster://server-event channel", async () => {
    const unlisten = vi.fn();
    listen.mockResolvedValue(unlisten);
    const received: ServerEvent[] = [];
    const stop = await new NativeRealtime().subscribe((event) => received.push(event));

    expect(listen).toHaveBeenCalledWith("fluster://server-event", expect.any(Function));
    const handler = listen.mock.calls[0][1] as (event: { payload: ServerEvent }) => void;
    handler({ payload: { kind: "user-data-changed", itemIds: ["aaaa"] } });
    expect(received).toEqual([{ kind: "user-data-changed", itemIds: ["aaaa"] }]);
    expect(stop).toBe(unlisten);
  });
});
