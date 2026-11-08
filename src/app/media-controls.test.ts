import { afterEach, describe, expect, it, vi } from "vitest";

const listeners = new Map<string, (event: { payload: unknown }) => void>();
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(name, handler);
    return unlisten;
  }),
}));

import { mediaControlAction, watchNativeMediaControls } from "./media-controls";

afterEach(() => {
  listeners.clear();
  unlisten.mockClear();
});

describe("mediaControlAction", () => {
  it("accepts only the typed stop action", () => {
    expect(mediaControlAction({ action: "stop" })).toBe("stop");
    for (const payload of [undefined, null, "stop", {}, { action: "play" }, { action: "seek", to: 1 }]) {
      expect(mediaControlAction(payload)).toBeUndefined();
    }
  });
});

describe("watchNativeMediaControls", () => {
  it("passes stop requests on, ignores anything else, and stops listening", async () => {
    const onAction = vi.fn();
    const stop = watchNativeMediaControls(onAction);
    await vi.waitFor(() => expect(listeners.has("fluster://media-control")).toBe(true));
    const emit = listeners.get("fluster://media-control")!;

    emit({ payload: { action: "stop" } });
    emit({ payload: { action: "open", uri: "https://example.test" } });
    expect(onAction.mock.calls).toEqual([["stop"]]);

    stop();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("drops a listener that arrives after watching stopped", async () => {
    const stop = watchNativeMediaControls(vi.fn());
    stop();
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });
});
