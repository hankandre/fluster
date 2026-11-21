import type { Cancel, Clock } from "./clock";

// How many microtask turns `advance` yields after each callback. Promise
// chains started by a callback (reporter queues, gateway calls) settle within
// this many turns; the bound keeps a never-ending chain from hanging a test.
const MICROTASK_TURNS = 100;

interface Timer {
  id: number;
  due: number;
  repeatMs: number | undefined;
  run: () => void;
}

/** A deterministic Clock for tests. Time moves only through `advance`. */
export class FakeClock implements Clock {
  private current: number;
  private nextId = 0;
  private timers: Timer[] = [];

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  after(ms: number, run: () => void): Cancel {
    return this.schedule(ms, undefined, run);
  }

  every(ms: number, run: () => void): Cancel {
    return this.schedule(ms, ms, run);
  }

  /** The number of timers that have not fired and were not cancelled. */
  pending(): number {
    return this.timers.length;
  }

  /** Move time forward by `ms`, running every due callback in due-time order. */
  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    await this.drain();
    for (;;) {
      const next = this.earliestDue(target);
      if (next === undefined) break;
      this.current = Math.max(this.current, next.due);
      if (next.repeatMs === undefined) {
        this.timers = this.timers.filter((timer) => timer.id !== next.id);
      } else {
        next.due += Math.max(next.repeatMs, 1);
      }
      next.run();
      await this.drain();
    }
    this.current = target;
    await this.drain();
  }

  private schedule(ms: number, repeatMs: number | undefined, run: () => void): Cancel {
    const timer: Timer = { id: this.nextId++, due: this.current + ms, repeatMs, run };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((candidate) => candidate.id !== timer.id);
    };
  }

  private earliestDue(limit: number): Timer | undefined {
    let best: Timer | undefined;
    for (const timer of this.timers) {
      if (timer.due > limit) continue;
      if (best === undefined || timer.due < best.due || (timer.due === best.due && timer.id < best.id)) best = timer;
    }
    return best;
  }

  private async drain(): Promise<void> {
    for (let turn = 0; turn < MICROTASK_TURNS; turn += 1) await Promise.resolve();
  }
}
