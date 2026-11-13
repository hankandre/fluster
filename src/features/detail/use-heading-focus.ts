import { useEffect, useRef } from "react";
import { isTvForm } from "../shared/tv-form";

// Focuses the page's h1 when the item first settles (loaded, missing, or failed), never while loading, so a
// screen reader hears the title once. After a Retry it focuses again, because the Retry button is gone.
export function useHeadingFocus(settled: boolean) {
  const heading = useRef<HTMLHeadingElement>(null);
  const wasSettled = useRef(false);
  useEffect(() => {
    // In the TV form the primary action takes focus when it mounts (useTvPrimaryRef); keep it.
    const primaryHasFocus = isTvForm() && document.activeElement?.closest("main a, main button") != null;
    if (settled && !wasSettled.current && !primaryHasFocus) heading.current?.focus();
    wasSettled.current = settled;
  }, [settled]);
  return heading;
}
