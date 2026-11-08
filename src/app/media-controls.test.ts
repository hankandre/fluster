import { describe, expect, it, vi } from "vitest";
import { createNativeMediaControls, mediaControlAction, type Listen } from "./media-controls";

type Handler = (event: { payload: unknown }) => void;

function fakeListen() {
  const handlers = new Map<string, Handler>();
  const listen = vi.fn(async (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {
      handlers.delete(name);
    };
  });
  return { listen, emit: (payload: unknown) => handlers.get("fluster://media-control")?.({ payload }) };
}

describe("mediaControlAction", () => {
  it("accepts only the typed stop action", () => {
    expect(mediaControlAction({ action: "stop" })).toBe("stop");
    for (const payload of [undefined, null, "stop", {}, { action: "play" }, { action: "seek", to: 1 }]) {
      expect(mediaControlAction(payload)).toBeUndefined();
    }
  });
});

describe("createNativeMediaControls", () => {
  it("listens once at creation, before anyone watches", async () => {
    const { listen } = fakeListen();
    const watch = createNativeMediaControls(async () => listen);
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(1));
    watch(vi.fn())();
    watch(vi.fn());
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it("delivers a stop to a watcher that attached synchronously, and ignores anything else", async () => {
    const { listen, emit } = fakeListen();
    const watch = createNativeMediaControls(async () => listen);
    const onAction = vi.fn();
    const unwatch = watch(onAction);
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    emit({ action: "stop" });
    emit({ action: "open", uri: "https://example.test" });
    expect(onAction.mock.calls).toEqual([["stop"]]);

    unwatch();
    emit({ action: "stop" });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("keeps watchers that attached before the listener finished registering", async () => {
    let finish!: (listen: Listen) => void;
    const { listen, emit } = fakeListen();
    const watch = createNativeMediaControls(() => new Promise((resolve) => { finish = resolve; }));
    const onAction = vi.fn();
    watch(onAction);
    finish(listen);
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    emit({ action: "stop" });
    expect(onAction).toHaveBeenCalledWith("stop");
  });
});
