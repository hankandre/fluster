import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUFFERING_STATUS_DELAY_MS } from "./timing";
import { useDelayedFlag } from "./use-delayed-flag";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const delay = BUFFERING_STATUS_DELAY_MS;

describe("useDelayedFlag", () => {
  it("stays false while the value is false", () => {
    const { result } = renderHook(() => useDelayedFlag(false, delay));
    advance(delay * 2);
    expect(result.current).toBe(false);
  });

  it("turns true only once the value has held for the delay", () => {
    const { result } = renderHook(() => useDelayedFlag(true, delay));
    advance(delay - 1);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
  });

  it("never turns true when the value drops before the delay", () => {
    const { result, rerender } = renderHook(({ value }) => useDelayedFlag(value, delay), { initialProps: { value: true } });
    advance(300);
    rerender({ value: false });
    advance(delay * 2);
    expect(result.current).toBe(false);
  });

  it("turns false in the same render in which the value drops", () => {
    const { result, rerender } = renderHook(({ value }) => useDelayedFlag(value, delay), { initialProps: { value: true } });
    advance(delay + 100);
    expect(result.current).toBe(true);
    rerender({ value: false });
    expect(result.current).toBe(false);
  });

  it("never shows two short stalls added together", () => {
    const { result, rerender } = renderHook(({ value }) => useDelayedFlag(value, delay), { initialProps: { value: true } });
    advance(300);
    rerender({ value: false });
    advance(100);
    rerender({ value: true });
    advance(300);
    expect(result.current).toBe(false);
  });

  it("makes a second stall wait its own delay", () => {
    const { result, rerender } = renderHook(({ value }) => useDelayedFlag(value, delay), { initialProps: { value: true } });
    advance(delay);
    expect(result.current).toBe(true);
    rerender({ value: false });
    rerender({ value: true });
    expect(result.current).toBe(false);
    advance(delay - 1);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
  });
});
