import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

// The list is in a portal so no scrolling or clipping ancestor (a dialog panel) cuts it off. It sits under
// the trigger, or above it when there is more room there. In the TV sheet form it has no inline placement.
export function useAnchoredPlace(
  open: boolean,
  sheet: boolean,
  trigger: RefObject<HTMLElement | null>,
  list: RefObject<HTMLElement | null>,
): CSSProperties {
  const [place, setPlace] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || sheet) return;
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const menu = list.current;
      if (!anchor || !menu) return;
      const margin = 8;
      const below = window.innerHeight - anchor.bottom - margin;
      const above = anchor.top - margin;
      const wanted = Math.min(menu.scrollHeight, 18 * parseFloat(getComputedStyle(document.documentElement).fontSize));
      const flip = wanted > below && above > below;
      const room = Math.max(flip ? above : below, 96);
      const height = Math.min(wanted, room);
      setPlace({
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - anchor.width - margin)),
        top: flip ? anchor.top - 4 - height : anchor.bottom + 4,
        minWidth: anchor.width,
        maxHeight: `min(${room}px, 18rem)`,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, sheet, trigger, list]);

  return place;
}
