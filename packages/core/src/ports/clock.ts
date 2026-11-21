// Time for the core. The host supplies it; the core never reads a timer or the wall clock directly.
export type Cancel = () => void;
export interface Clock {
  now(): number; // epoch milliseconds
  after(ms: number, run: () => void): Cancel; // one-shot
  every(ms: number, run: () => void): Cancel; // repeating, first run after `ms`
}
