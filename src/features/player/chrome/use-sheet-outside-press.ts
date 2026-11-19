import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { CHROME_ZONE_ATTRIBUTE } from "./use-chrome-visibility";

// A press here is not outside an open sheet: chrome zones (the sheet itself, the top bar, the control row, Skip,
// Up Next) and any other control keep their own meaning.
const NOT_OUTSIDE = `[${CHROME_ZONE_ATTRIBUTE}], button, a[href], input, select, textarea, [role="button"], [role="option"], [tabindex]:not([tabindex="-1"])`;

// Desktop (DESIGN.md 7.14; owner, 2026-11-19): a primary press outside an open sheet, on the video, closes the
// sheet and does nothing else. The sheet stays non-modal: nothing is inert and the video keeps playing. A layer in
// a portal (a Picker list, a Dialog) reaches the player through React but sits outside its element, so it never
// counts. The TV form is unchanged.
export function useSheetOutsidePress({ region, open, tv, onClose }: {
  region: RefObject<HTMLElement | null>;
  open: boolean;
  tv: boolean;
  onClose(): void;
}) {
  return useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (tv || !open || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || !region.current?.contains(target) || target.closest(NOT_OUTSIDE)) return;
    onClose();
  }, [region, open, tv, onClose]);
}
