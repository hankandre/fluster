import { useEffect, useRef } from "react";

// Focuses the page's h1 when the item first settles (loaded, missing, or failed), never while loading, so a
// screen reader hears the title once. After a Retry it focuses again, because the Retry button is gone.
export function useHeadingFocus(settled: boolean) {
  const heading = useRef<HTMLHeadingElement>(null);
  const wasSettled = useRef(false);
  useEffect(() => {
    if (settled && !wasSettled.current) heading.current?.focus();
    wasSettled.current = settled;
  }, [settled]);
  return heading;
}
