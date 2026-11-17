// Timing for "Up next". Pure so it can be tested without a clock.

// The default countdown; the viewer's choice comes from the auto-play preference.
export const AUTO_PLAY_SECONDS = 10;
export const DEFAULT_END_WINDOW_SECONDS = 30;

// Where the card appears: at the start of the Outro (credits) when the server
// marks one, else DEFAULT_END_WINDOW_SECONDS before the end. Never later than
// the full countdown before the end, so the countdown always fits.
export function cardStartSeconds(
  durationSeconds: number,
  outroStartSeconds?: number,
  countdownSeconds: number = AUTO_PLAY_SECONDS,
): number {
  // An Outro that starts at zero or before the middle is bad data, not credits.
  const credible = outroStartSeconds !== undefined && outroStartSeconds > 0 && outroStartSeconds >= durationSeconds / 2;
  const wanted = credible ? outroStartSeconds : durationSeconds - DEFAULT_END_WINDOW_SECONDS;
  return Math.min(wanted, durationSeconds - countdownSeconds);
}

export function inEndWindow(
  positionSeconds: number,
  durationSeconds: number | undefined,
  outroStartSeconds?: number,
  countdownSeconds: number = AUTO_PLAY_SECONDS,
): boolean {
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  if (!Number.isFinite(positionSeconds)) return false;
  return positionSeconds >= cardStartSeconds(durationSeconds, outroStartSeconds, countdownSeconds);
}

// secondsLeft is undefined while the card is hidden. dismissed is set by Hide
// and lasts for the session: the card does not come back and nothing advances.
export interface AutoPlayState {
  secondsLeft: number | undefined;
  dismissed: boolean;
}

export type AutoPlayAction =
  | { type: "window"; inWindow: boolean; countdownSeconds?: number }
  | { type: "tick" }
  | { type: "hide" };

export function autoPlayReducer(state: AutoPlayState, action: AutoPlayAction): AutoPlayState {
  switch (action.type) {
    case "window":
      if (state.dismissed) return state;
      if (!action.inWindow) return state.secondsLeft === undefined ? state : { ...state, secondsLeft: undefined };
      return state.secondsLeft === undefined ? { ...state, secondsLeft: action.countdownSeconds ?? AUTO_PLAY_SECONDS } : state;
    case "tick":
      if (state.secondsLeft === undefined) return state;
      return { ...state, secondsLeft: Math.max(0, state.secondsLeft - 1) };
    case "hide":
      return { secondsLeft: undefined, dismissed: true };
  }
}
