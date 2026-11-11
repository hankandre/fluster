import { useCallback, useEffect, useRef } from "react";

// Runs the latest scheduled callback once focus has rested for `ms`. Each new schedule restarts the wait,
// and unmounting cancels it.
export function useFocusDwell(ms: number): (callback: () => void) => void {
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return useCallback((callback) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(callback, ms);
  }, [ms]);
}
