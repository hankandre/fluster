import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoPaging } from "./use-auto-paging";

let observers: FakeObserver[] = [];

class FakeObserver {
  disconnected = false;
  constructor(readonly callback: (entries: { isIntersecting: boolean }[]) => void, readonly options: IntersectionObserverInit) {
    observers.push(this);
  }
  observe() {}
  disconnect() { this.disconnected = true; }
  emit(isIntersecting: boolean) {
    act(() => this.callback([{ isIntersecting }]));
  }
}

function Probe({ enabled, onLoad }: { enabled: boolean; onLoad(): void }) {
  const ref = useAutoPaging({ enabled, onLoad });
  return <div ref={ref} />;
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAutoPaging", () => {
  it("watches one viewport ahead and loads when the sentinel intersects", () => {
    const onLoad = vi.fn();
    render(<Probe enabled onLoad={onLoad} />);
    expect(observers[0]?.options.rootMargin).toBe("0px 0px 100% 0px");
    expect(onLoad).not.toHaveBeenCalled();
    observers[0].emit(true);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("does not load while disabled (fetching, failed, or no next page)", () => {
    const onLoad = vi.fn();
    render(<Probe enabled={false} onLoad={onLoad} />);
    observers[0].emit(true);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("loads again when enabled returns while the sentinel is still near", () => {
    const onLoad = vi.fn();
    const { rerender } = render(<Probe enabled onLoad={onLoad} />);
    observers[0].emit(true);
    rerender(<Probe enabled={false} onLoad={onLoad} />);
    rerender(<Probe enabled onLoad={onLoad} />);
    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  it("does not load once the sentinel leaves the area", () => {
    const onLoad = vi.fn();
    const { rerender } = render(<Probe enabled onLoad={onLoad} />);
    observers[0].emit(true);
    observers[0].emit(false);
    rerender(<Probe enabled={false} onLoad={onLoad} />);
    rerender(<Probe enabled onLoad={onLoad} />);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("disconnects on unmount", () => {
    const { unmount } = render(<Probe enabled onLoad={vi.fn()} />);
    unmount();
    expect(observers[0].disconnected).toBe(true);
  });

  it("does nothing without IntersectionObserver", () => {
    vi.unstubAllGlobals();
    const onLoad = vi.fn();
    expect(() => render(<Probe enabled onLoad={onLoad} />)).not.toThrow();
    expect(onLoad).not.toHaveBeenCalled();
  });
});
