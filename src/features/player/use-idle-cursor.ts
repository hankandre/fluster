import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

export const CURSOR_IDLE_MS = 3000;

// Pointing at one of these keeps the cursor visible.
const CONTROL_SELECTOR = "button, a[href], input, select, label, [role='slider']";

function overControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CONTROL_SELECTOR) !== null;
}

// Hides the pointer over the player once it has been still for `idleMs`.
// Moving it shows it again; resting it on a control keeps it shown.
export function useIdleCursor(idleMs = CURSOR_IDLE_MS) {
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const restart = useCallback((keepVisible: boolean) => {
    window.clearTimeout(timer.current);
    setIdle(false);
    if (!keepVisible) timer.current = window.setTimeout(() => setIdle(true), idleMs);
  }, [idleMs]);

  useEffect(() => {
    restart(false);
    return () => window.clearTimeout(timer.current);
  }, [restart]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    restart(overControl(event.target));
  }, [restart]);

  return { idle, onPointerMove };
}
