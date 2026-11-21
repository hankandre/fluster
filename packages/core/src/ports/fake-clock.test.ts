import { describe, expect, it } from "vitest";
import { FakeClock } from "./fake-clock";

describe("FakeClock", () => {
  it("fires one-shot timers in due-time order and sets now() to each due time", async () => {
    const clock = new FakeClock(1_000);
    const seen: Array<[string, number]> = [];
    clock.after(30, () => seen.push(["b", clock.now()]));
    clock.after(10, () => seen.push(["a", clock.now()]));
    await clock.advance(50);
    expect(seen).toEqual([["a", 1_010], ["b", 1_030]]);
    expect(clock.now()).toBe(1_050);
    expect(clock.pending()).toBe(0);
  });

  it("does not fire a timer before it is due", async () => {
    const clock = new FakeClock();
    let fired = 0;
    clock.after(100, () => (fired += 1));
    await clock.advance(99);
    expect(fired).toBe(0);
    await clock.advance(1);
    expect(fired).toBe(1);
  });

  it("does not fire a cancelled timer", async () => {
    const clock = new FakeClock();
    let fired = 0;
    const cancel = clock.after(10, () => (fired += 1));
    cancel();
    await clock.advance(100);
    expect(fired).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  it("re-arms every() until cancelled", async () => {
    const clock = new FakeClock();
    let fired = 0;
    const cancel = clock.every(10, () => (fired += 1));
    await clock.advance(9);
    expect(fired).toBe(0);
    await clock.advance(21);
    expect(fired).toBe(3);
    cancel();
    await clock.advance(100);
    expect(fired).toBe(3);
  });

  it("lets a promise chain started by a callback settle", async () => {
    const clock = new FakeClock();
    let done = false;
    clock.after(5, () => {
      let chain: Promise<void> = Promise.resolve();
      for (let i = 0; i < 8; i += 1) chain = chain.then(() => undefined);
      void chain.then(() => {
        done = true;
      });
    });
    await clock.advance(5);
    expect(done).toBe(true);
  });

  it("runs a timer scheduled by a callback when it falls inside the window", async () => {
    const clock = new FakeClock();
    const seen: number[] = [];
    clock.after(10, () => {
      clock.after(10, () => seen.push(clock.now()));
    });
    await clock.advance(25);
    expect(seen).toEqual([20]);
  });
});
