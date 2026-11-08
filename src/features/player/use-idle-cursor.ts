import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

export const CURSOR_IDLE_MS = 3000;

// Pointing at one of these keeps the cursor visible.
const CONTROL_SELECTOR = "button, a[href], input, select, label, [role='slider']";

function overControl(target: Element | null | undefined): boolean {
  return target?.closest(CONTROL_SELECTOR) != null;
}

interface PointerSpot {
  x: number;
  y: number;
}

// What the pointer is over now. Hit-testing its last position skips
// controls that have since faded out (they stop taking the pointer).
// Before the pointer has moved, the hovered element stands in.
function elementUnderPointer(spot: PointerSpot | undefined): Element | null {
  if (spot && typeof document.elementFromPoint === "function") {
    return document.elementFromPoint(spot.x, spot.y);
  }
  try {
    const hovered = document.querySelectorAll(":hover");
    return hovered.length > 0 ? hovered[hovered.length - 1] : null;
  } catch {
    return null;
  }
}

// Hides the pointer over the player once it has been still for `idleMs`.
// Moving it shows it again. When the time is up, a pointer resting on a
// visible control stays shown and is checked again later.
export function useIdleCursor(idleMs = CURSOR_IDLE_MS) {
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const spot = useRef<PointerSpot | undefined>(undefined);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(function expire() {
      if (overControl(elementUnderPointer(spot.current))) {
        timer.current = window.setTimeout(expire, idleMs);
      } else {
        setIdle(true);
      }
    }, idleMs);
  }, [idleMs]);

  useEffect(() => {
    schedule();
    return () => window.clearTimeout(timer.current);
  }, [schedule]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const { clientX, clientY } = event;
    spot.current = Number.isFinite(clientX) && Number.isFinite(clientY) ? { x: clientX, y: clientY } : undefined;
    setIdle(false);
    schedule();
  }, [schedule]);

  return { idle, onPointerMove };
}
