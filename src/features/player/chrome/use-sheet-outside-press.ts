import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

// A press here is not outside an open sheet: the sheet itself, the scrubber's track, and every control (in the top
// bar, the control row, Skip, or Up Next) keep their own meaning. Empty space in the chrome counts as the video.
const NOT_OUTSIDE = `.player-sheet, .seek-track, button, a[href], input, select, textarea, [role="button"], [role="option"], [role="slider"], [tabindex]:not([tabindex="-1"])`;

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
