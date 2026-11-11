import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFocusDwell } from "./use-focus-dwell";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useFocusDwell", () => {
  it("fires at 300 ms and not before", () => {
    const { result } = renderHook(() => useFocusDwell(300));
    const fn = vi.fn();
    result.current(fn);
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("restarts on a second focus, which wins", () => {
    const { result } = renderHook(() => useFocusDwell(300));
    const first = vi.fn();
    const second = vi.fn();
    result.current(first);
    vi.advanceTimersByTime(200);
    result.current(second);
    vi.advanceTimersByTime(200);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancels on unmount", () => {
    const { result, unmount } = renderHook(() => useFocusDwell(300));
    const fn = vi.fn();
    result.current(fn);
    unmount();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
