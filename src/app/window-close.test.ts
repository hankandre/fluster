import { afterEach, describe, expect, it, vi } from "vitest";

type CloseHandler = (event: { preventDefault(): void }) => Promise<void>;

const windowMock = vi.hoisted(() => ({
  handler: undefined as CloseHandler | undefined,
  destroy: vi.fn<() => Promise<void>>(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: CloseHandler) => {
      windowMock.handler = handler;
      return () => undefined;
    },
    destroy: windowMock.destroy,
  }),
}));

import { watchNativeWindowClose } from "./window-close";

async function closeRequested(): Promise<void> {
  await vi.waitFor(() => expect(windowMock.handler).toBeDefined());
  await windowMock.handler!({ preventDefault: () => undefined });
}

describe("watchNativeWindowClose", () => {
  afterEach(() => {
    windowMock.handler = undefined;
    windowMock.destroy.mockReset();
  });

  it("destroys the window after a stop that failed", async () => {
    windowMock.destroy.mockResolvedValue(undefined);
    const beforeClose = vi.fn(async () => {
      throw new Error("The player stop task did not finish.");
    });
    watchNativeWindowClose(beforeClose);
    await closeRequested();
    expect(beforeClose).toHaveBeenCalledTimes(1);
    expect(windowMock.destroy).toHaveBeenCalledTimes(1);
  });

  it("tries again on the next close when destroying the window failed", async () => {
    windowMock.destroy.mockRejectedValueOnce(new Error("not allowed")).mockResolvedValue(undefined);
    const beforeClose = vi.fn(async () => undefined);
    watchNativeWindowClose(beforeClose);
    await closeRequested();
    await closeRequested();
    expect(beforeClose).toHaveBeenCalledTimes(2);
    expect(windowMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("ignores a second close while the first is still stopping", async () => {
    windowMock.destroy.mockResolvedValue(undefined);
    let finishStop = () => undefined as void;
    const beforeClose = vi.fn(() => new Promise<void>((resolve) => { finishStop = resolve; }));
    watchNativeWindowClose(beforeClose);
    const first = closeRequested();
    await vi.waitFor(() => expect(beforeClose).toHaveBeenCalledTimes(1));
    await closeRequested();
    finishStop();
    await first;
    expect(beforeClose).toHaveBeenCalledTimes(1);
    expect(windowMock.destroy).toHaveBeenCalledTimes(1);
  });
});
