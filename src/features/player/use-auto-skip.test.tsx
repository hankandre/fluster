import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaSegment } from "../../domain/media-segments";
import { useAutoSkip } from "./use-auto-skip";

const intro: MediaSegment = { kind: "Intro", startSeconds: 10, endSeconds: 70 };
const outro: MediaSegment = { kind: "Outro", startSeconds: 1000, endSeconds: 1100 };

interface Props {
  itemId: string;
  segments: MediaSegment[];
  positionSeconds: number | undefined;
  ready: boolean;
}

const seek = vi.fn<(seconds: number) => Promise<boolean>>();
const showOsd = vi.fn<(text: string) => void>();

function setup(initial: Partial<Props> = {}) {
  const start: Props = { itemId: "e1", segments: [intro, outro], positionSeconds: 0, ready: true, ...initial };
  const hook = renderHook((props: Props) => useAutoSkip({ ...props, seek, showOsd }), { initialProps: start });
  return { hook, props: start };
}

async function at(handle: ReturnType<typeof setup>, positionSeconds: number, extra: Partial<Props> = {}) {
  handle.props = { ...handle.props, positionSeconds, ...extra };
  await act(async () => {
    handle.hook.rerender(handle.props);
  });
}

beforeEach(() => {
  seek.mockReset().mockResolvedValue(true);
  showOsd.mockReset();
});

describe("useAutoSkip", () => {
  it("seeks past the segment and says so, once", async () => {
    const hook = setup();
    await at(hook, 30);
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(70);
    expect(showOsd).toHaveBeenCalledWith("Skipped intro");
    await at(hook, 31);
    await at(hook, 32);
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it("does not skip again after a seek back into the segment", async () => {
    const hook = setup();
    await at(hook, 30);
    await at(hook, 70);
    await at(hook, 30);
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it("still skips a segment of the other kind", async () => {
    const hook = setup();
    await at(hook, 30);
    await at(hook, 1010);
    expect(seek).toHaveBeenLastCalledWith(1100);
    expect(showOsd).toHaveBeenLastCalledWith("Skipped credits");
    expect(seek).toHaveBeenCalledTimes(2);
  });

  it("does nothing before the first frame or while a session error shows", async () => {
    const hook = setup({ ready: false });
    await at(hook, 30);
    expect(seek).not.toHaveBeenCalled();
    await at(hook, 31, { ready: true });
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside a segment or without segments", async () => {
    const hook = setup({ segments: [] });
    await at(hook, 30);
    expect(seek).not.toHaveBeenCalled();
  });

  it("does not retry a failed seek and says nothing", async () => {
    seek.mockResolvedValue(false);
    const hook = setup();
    await at(hook, 30);
    await at(hook, 31);
    expect(seek).toHaveBeenCalledTimes(1);
    expect(showOsd).not.toHaveBeenCalled();
  });

  it("skips again for a different item", async () => {
    const hook = setup();
    await at(hook, 30);
    await at(hook, 0, { itemId: "e2" });
    await at(hook, 30);
    expect(seek).toHaveBeenCalledTimes(2);
  });
});
