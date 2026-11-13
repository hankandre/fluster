// Keyboard shortcuts in the player. Pure: maps one key press to an action, or
// to nothing when the focused control owns that key.

export type PlayerKeyAction =
  | { kind: "toggle-pause" }
  | { kind: "seek-by"; seconds: number }
  | { kind: "volume-by"; amount: number }
  | { kind: "toggle-mute" }
  | { kind: "toggle-fullscreen" }
  | { kind: "cycle-subtitles" }
  | { kind: "seek-to"; fraction: number }
  | { kind: "open-tracks" }
  | { kind: "toggle-info" }
  | { kind: "skip" }
  | { kind: "play-next" }
  // OK on a TV remote: acts only in the TV form while the chrome is hidden.
  | { kind: "ok" }
  // A TV arrow with focus on the player region: wakes the chrome with focus on the scrubber.
  | { kind: "wake" }
  | { kind: "escape" };

export interface PlayerKeyInput {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  // The 10-foot form: arrows wake the chrome and never change the volume; the focused scrubber seeks.
  tv?: boolean;
}

export const SEEK_STEP_SECONDS = 10;
export const VOLUME_STEP = 5;

// What the focused element does with keys of its own. A select keeps every
// key, Escape included: Escape closes its list instead of leaving the player.
// A list keeps the keys that move through and choose its rows.
type TargetKind = "text" | "slider" | "list" | "activator" | "other";

const ACTIVATOR_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset"]);
const SLIDER_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const LIST_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End", "Enter", " "]);

function targetKind(target: EventTarget | null): TargetKind {
  if (!(target instanceof HTMLElement)) return "other";
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return "text";
  if (target instanceof HTMLSelectElement) return "text";
  if (target instanceof HTMLInputElement) {
    if (target.type === "range") return "slider";
    return ACTIVATOR_INPUTS.has(target.type) ? "activator" : "text";
  }
  if (target.closest('[role="listbox"]')) return "list";
  if (target.closest("button, a[href], summary")) return "activator";
  return "other";
}

function actionFor(key: string): PlayerKeyAction | undefined {
  switch (key) {
    case " ":
    case "k":
      return { kind: "toggle-pause" };
    case "ArrowLeft":
    case "j":
      return { kind: "seek-by", seconds: -SEEK_STEP_SECONDS };
    case "ArrowRight":
    case "l":
      return { kind: "seek-by", seconds: SEEK_STEP_SECONDS };
    case "ArrowUp":
      return { kind: "volume-by", amount: VOLUME_STEP };
    case "ArrowDown":
      return { kind: "volume-by", amount: -VOLUME_STEP };
    case "m":
      return { kind: "toggle-mute" };
    case "f":
      return { kind: "toggle-fullscreen" };
    case "c":
      return { kind: "cycle-subtitles" };
    case "Home":
      return { kind: "seek-to", fraction: 0 };
    case "End":
      return { kind: "seek-to", fraction: 1 };
    case "a":
      return { kind: "open-tracks" };
    case "i":
      return { kind: "toggle-info" };
    case "s":
      return { kind: "skip" };
    case "n":
      return { kind: "play-next" };
    case "Enter":
      return { kind: "ok" };
    case "Escape":
      return { kind: "escape" };
    default:
      if (/^[0-9]$/.test(key)) return { kind: "seek-to", fraction: Number(key) / 10 };
      return undefined;
  }
}

// Seeking and volume repeat while the key is held; toggles do not.
function repeats(action: PlayerKeyAction): boolean {
  return action.kind === "seek-by" || action.kind === "volume-by";
}

export function playerKeyAction(input: PlayerKeyInput): PlayerKeyAction | undefined {
  if (input.ctrlKey || input.metaKey || input.altKey) return undefined;
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const action = actionFor(key);
  if (!action) return undefined;
  if (input.tv && ARROW_KEYS.has(key)) {
    // Arrows wake the chrome from the player region and belong to the focused control otherwise.
    return targetKind(input.target) === "other" ? { kind: "wake" } : undefined;
  }
  if (input.repeat && !repeats(action)) return undefined;
  switch (targetKind(input.target)) {
    case "text":
      return undefined;
    case "slider":
      return SLIDER_KEYS.has(key) ? undefined : action;
    case "list":
      return LIST_KEYS.has(key) ? undefined : action;
    case "activator":
      return key === " " || key === "Enter" ? undefined : action;
    case "other":
      return action;
  }
}
