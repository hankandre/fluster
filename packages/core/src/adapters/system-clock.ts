import type { Clock } from "../ports/clock";

/** The reference Clock for Node tests and the tripwire. Apps supply their own. */
export const systemClock: Clock = {
  now: () => Date.now(),
  after(ms, run) {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
  every(ms, run) {
    const timer = setInterval(run, ms);
    return () => clearInterval(timer);
  },
};
