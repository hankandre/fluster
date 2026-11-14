import { useEffect, useRef } from "react";
import { isTvForm } from "../shared/tv-form";
import { deferDefaultFocus } from "../shell/focus-return";

// Focuses the page's h1 when the item first settles (loaded, missing, or failed), never while loading, so a
// screen reader hears the title once. After a Retry it focuses again, because the Retry button is gone.
export function useHeadingFocus(settled: boolean) {
  const heading = useRef<HTMLHeadingElement>(null);
  const wasSettled = useRef(false);
  useEffect(() => {
    // In the TV form the primary action takes focus when it mounts (useTvPrimaryRef); keep it.
    const primaryHasFocus = isTvForm() && document.activeElement?.closest("main a, main button") != null;
    // A card restored by a return (DESIGN.md 9) may already hold focus when the title settles; keep it.
    const cardHasFocus = document.activeElement?.closest("main [data-focus-id]") != null;
    if (settled && !wasSettled.current && !primaryHasFocus && !cardHasFocus && heading.current && !deferDefaultFocus(heading.current)) heading.current.focus();
    wasSettled.current = settled;
  }, [settled]);
  return heading;
}
