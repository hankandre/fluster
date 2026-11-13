// How long a remote key must stay down to count as a hold (DESIGN.md 7.5, 7.14). A starting value to tune
// in the dogfood week.
export const HOLD_MS = 500;

export function isHeld(downAt: number, now: number): boolean {
  return now - downAt >= HOLD_MS;
}
