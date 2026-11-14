import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { finishReturn, getPendingReturn, subscribeReturn, tryRestore } from "./focus-return";

// A give-up time for a return whose screen never settles; not a motion duration.
export const RETURN_WAIT_MS = 10_000;

// Drives a pending return to a remembered card (DESIGN.md 9): focuses it as soon as it renders, and when the
// screen has settled without it, falls back to the same place in the row, then the screen's opening focus.
export function useFocusReturn(): void {
  const pending = useSyncExternalStore(subscribeReturn, getPendingReturn, () => undefined);
  const fetching = useIsFetching();
  const fetchingRef = useRef(fetching);
  fetchingRef.current = fetching;
  const checkRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!pending) return undefined;
    let frame = 0;
    const settled = () => fetchingRef.current === 0 && document.querySelector('main [aria-busy="true"]') === null;
    // The screen counts as settled after two quiet frames, so a query that starts right after another ends
    // (a detail, then its grid) does not end the wait early. Any change to the page starts the count again.
    const cancel = () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const check = () => {
      if (tryRestore()) return;
      cancel();
      if (!settled()) return;
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (tryRestore()) return;
          if (settled()) finishReturn();
        });
      });
    };
    checkRef.current = check;
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    const timer = window.setTimeout(() => {
      if (!tryRestore()) finishReturn(true);
    }, RETURN_WAIT_MS);
    check();
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancel();
      checkRef.current = () => undefined;
    };
  }, [pending]);

  useEffect(() => {
    checkRef.current();
  }, [fetching]);
}
