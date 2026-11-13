import { useCallback, useEffect, useRef, useState, type FocusEvent, type MouseEvent as ReactMouseEvent } from "react";
import { CHROME_IDLE_MS } from "./timing";

// Marks a chrome zone (top bar, scrubber, controls) or a prompt. Keyboard focus
// inside one keeps the chrome up.
export const CHROME_ZONE_ATTRIBUTE = "data-chrome-zone";
const ZONE_SELECTOR = `[${CHROME_ZONE_ATTRIBUTE}]`;

function inPrompt(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".player-prompt") != null;
}

function inZone(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(ZONE_SELECTOR) != null;
}

// The three chrome zones show and hide together. They are visible while
// paused or before playback, while pinned (an error, an open sheet), while
// keyboard focus is on a chrome control or prompt, and for CHROME_IDLE_MS
// after the last pointer move (or the resume from a pause). The pointer leaving the player hides them at
// once while playing. A control focused by a click does not hold the chrome up.
//
// In the TV form (DESIGN.md 7.14) a focused control does not keep the chrome up while playing: it hides
// CHROME_IDLE_MS after the last key, and `wake` brings it back. Paused, pinned, and prompts still hold it.
export function useChromeVisibility({ playing, pinned, tv = false }: { playing: boolean; pinned: boolean; tv?: boolean }) {
  const [awake, setAwake] = useState(true);
  const [focused, setFocused] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const byPointer = useRef(false);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    setAwake(true);
    timer.current = window.setTimeout(() => setAwake(false), CHROME_IDLE_MS);
  }, []);

  // The first start leaves the chrome up until the pointer moves, as before.
  // Resuming from a pause hides it again after the idle time.
  const wasPlaying = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (playing && wasPlaying.current === false) schedule();
    if (!playing) window.clearTimeout(timer.current);
    wasPlaying.current = playing;
  }, [playing, schedule]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A sheet that closes takes its focused control with it, and the browser may
  // not say so: look again at where focus is.
  useEffect(() => {
    if (!pinned) setFocused(!byPointer.current && inZone(document.activeElement));
  }, [pinned]);

  // Any key press, from anywhere, makes the next focus a keyboard focus.
  // Escape is the exception: it closes a sheet a click opened, and the focus
  // that code then restores is still the click's.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return;
      byPointer.current = false;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // The browser repeats a mouse move at the same spot when the element under a
  // resting pointer changes (the chrome hiding does that). Only a changed
  // position counts as input, or the chrome would flicker back at once.
  const lastSpot = useRef<{ x: number; y: number } | undefined>(undefined);
  const wake = useCallback((event: ReactMouseEvent) => {
    const last = lastSpot.current;
    if (last && last.x === event.clientX && last.y === event.clientY) return;
    lastSpot.current = { x: event.clientX, y: event.clientY };
    if (playing) schedule();
    else setAwake(true);
  }, [playing, schedule]);

  const sleep = useCallback(() => {
    lastSpot.current = undefined;
    if (!playing) return;
    window.clearTimeout(timer.current);
    setAwake(false);
  }, [playing]);

  // TV form: any key press while playing keeps the chrome up for another idle period.
  useEffect(() => {
    if (!tv) return undefined;
    const onKey = () => {
      if (playing) schedule();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tv, playing, schedule]);

  const wakeNow = useCallback(() => {
    if (playing) schedule();
    else setAwake(true);
  }, [playing, schedule]);

  const sectionProps = {
    onMouseMove: wake,
    onMouseLeave: sleep,
    onPointerDown: () => {
      byPointer.current = true;
      setFocused(false);
    },
    onFocus: (event: FocusEvent) => {
      if (!byPointer.current && inZone(event.target)) setFocused(true);
      setPromptFocused(inPrompt(event.target));
    },
    onBlur: (event: FocusEvent) => {
      setFocused(!byPointer.current && inZone(event.relatedTarget));
      setPromptFocused(inPrompt(event.relatedTarget));
    },
  };

  return { visible: !playing || pinned || (focused && (!tv || promptFocused)) || awake, wake: wakeNow, sectionProps };
}
