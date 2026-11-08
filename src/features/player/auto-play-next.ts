// Timing for "Up next". Pure so it can be tested without a clock.

export const AUTO_PLAY_SECONDS = 10;
export const DEFAULT_END_WINDOW_SECONDS = 30;

// How close to the end the card appears. When the server marks credits (an
// Outro segment), pass how long they last; never less than the default.
export function endWindowSeconds(creditsSeconds?: number): number {
  return Math.max(DEFAULT_END_WINDOW_SECONDS, creditsSeconds ?? 0);
}

export function inEndWindow(
  positionSeconds: number,
  durationSeconds: number | undefined,
  windowSeconds: number,
): boolean {
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  if (!Number.isFinite(positionSeconds)) return false;
  return durationSeconds - positionSeconds <= windowSeconds;
}

// secondsLeft is undefined while the card is hidden.
export interface AutoPlayState {
  secondsLeft: number | undefined;
}

export type AutoPlayAction =
  | { type: "window"; inWindow: boolean }
  | { type: "tick" };

export function autoPlayReducer(state: AutoPlayState, action: AutoPlayAction): AutoPlayState {
  switch (action.type) {
    case "window":
      if (!action.inWindow) return state.secondsLeft === undefined ? state : { secondsLeft: undefined };
      return state.secondsLeft === undefined ? { secondsLeft: AUTO_PLAY_SECONDS } : state;
    case "tick":
      if (state.secondsLeft === undefined) return state;
      return { secondsLeft: Math.max(0, state.secondsLeft - 1) };
  }
}
