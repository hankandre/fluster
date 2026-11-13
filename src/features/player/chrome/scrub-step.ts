// The TV scrub rule (DESIGN.md 7.14, D16 B). Starting values to tune on a real remote.
export const SCRUB_TICK_MS = 200;
const PRESS_STEP_SECONDS = 10;

// Seconds moved per tick after the key has been down `heldMs`: 10 s under 1 s, 20 s under 2 s, 60 s under 4 s,
// then 120 s; never more than a fiftieth of the duration (but at least 10 s).
export function scrubStep(heldMs: number, durationSeconds: number): number {
  let step: number;
  if (heldMs < 1000) step = PRESS_STEP_SECONDS;
  else if (heldMs < 2000) step = 20;
  else if (heldMs < 4000) step = 60;
  else step = 120;
  return Math.min(step, Math.max(PRESS_STEP_SECONDS, durationSeconds / 50));
}

export function scrubTarget(from: number, step: number, direction: 1 | -1, durationSeconds: number): number {
  return Math.min(Math.max(0, from + direction * step), durationSeconds);
}
