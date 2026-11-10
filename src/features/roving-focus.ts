import { useCallback, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";

// How arrow keys move between items: a row moves with Left/Right, a column
// with Up/Down, and a grid with both (Up/Down move by one visual row).
export type RovingLayout = "row" | "column" | "grid";

const ITEM_SELECTOR = "[data-roving-item]";

// The index an arrow, Home, or End key moves to, or undefined when the key
// does not move focus in this layout.
export function nextRovingIndex(
  key: string,
  index: number,
  count: number,
  layout: RovingLayout,
  columns: number,
): number | undefined {
  if (count === 0) return undefined;
  const last = count - 1;
  const step = layout === "grid" ? Math.max(1, columns) : 1;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return last;
    case "ArrowRight":
      return layout === "column" ? undefined : Math.min(index + 1, last);
    case "ArrowLeft":
      return layout === "column" ? undefined : Math.max(index - 1, 0);
    case "ArrowDown":
      if (layout === "row") return undefined;
      if (index + step <= last) return index + step;
      // A short last row: go to its last item, but only from the row above it.
      return Math.floor(last / step) > Math.floor(index / step) ? last : undefined;
    case "ArrowUp":
      if (layout === "row") return undefined;
      return index - step >= 0 ? index - step : undefined;
    default:
      return undefined;
  }
}

// The index of the box whose horizontal centre is nearest to `centreX`. Boxes are in left-to-right order,
// so a tie goes to the left one. An empty list gives undefined.
export function nearestByCentre(centreX: number, boxes: { left: number; width: number }[]): number | undefined {
  let best: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  boxes.forEach((box, index) => {
    const distance = Math.abs(box.left + box.width / 2 - centreX);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

const SPATIAL_ROW_SELECTOR = "[data-spatial-row]";

// Moves focus Up or Down to the nearest item (by horizontal centre) of the adjacent spatial row
// in the same <main>. Returns true when it moved focus.
function moveBetweenRows(container: HTMLElement, current: HTMLElement, direction: 1 | -1): boolean {
  const scope: ParentNode = container.closest("main") ?? document;
  const rows = Array.from(scope.querySelectorAll<HTMLElement>(SPATIAL_ROW_SELECTOR));
  let index = rows.indexOf(container) + direction;
  while (index >= 0 && index < rows.length && itemsIn(rows[index]).length === 0) index += direction;
  if (index < 0 || index >= rows.length) return false;
  const items = itemsIn(rows[index]);
  const box = current.getBoundingClientRect();
  const target = nearestByCentre(box.left + box.width / 2, items.map((item) => item.getBoundingClientRect()));
  if (target === undefined) return false;
  items[target].focus();
  return true;
}

function itemsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
}

// Items laid out on the same line as the first one.
function columnsOf(items: HTMLElement[]): number {
  if (items.length === 0) return 1;
  const top = items[0].offsetTop;
  const columns = items.filter((item) => item.offsetTop === top).length;
  return Math.max(1, columns);
}

// Roving tabindex: the list is one Tab stop, and arrow keys move inside it.
// Items opt in with `data-roving-item`. The last focused item keeps the Tab
// stop, so Tab back into the list returns to it.
// `preferredIndex` moves the Tab stop (never focus) whenever its value changes between renders.
export function useRovingFocus<T extends HTMLElement>(layout: RovingLayout, options?: { preferredIndex?: number; spatial?: boolean }) {
  const ref = useRef<T>(null);
  const active = useRef(0);
  const preferred = options?.preferredIndex;
  const spatial = options?.spatial === true;
  const lastPreferred = useRef<number | undefined>(undefined);

  const sync = useCallback(() => {
    const container = ref.current;
    if (!container) return;
    const items = itemsIn(container);
    if (preferred !== undefined && preferred !== lastPreferred.current) {
      active.current = Math.max(0, Math.min(preferred, items.length - 1));
    }
    lastPreferred.current = preferred;
    if (active.current >= items.length) active.current = 0;
    items.forEach((item, index) => item.setAttribute("tabindex", index === active.current ? "0" : "-1"));
  }, [preferred]);

  // Runs after every render, so new pages of items join the roving set.
  useLayoutEffect(sync);

  const onKeyDown = useCallback((event: KeyboardEvent<T>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const items = itemsIn(event.currentTarget);
    const current = items.findIndex((item) => item === event.target || item.contains(event.target as Node));
    if (current < 0) return;
    const next = nextRovingIndex(event.key, current, items.length, layout, columnsOf(items));
    if (next === undefined) {
      if (spatial && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        if (moveBetweenRows(event.currentTarget, items[current], event.key === "ArrowDown" ? 1 : -1)) event.preventDefault();
      }
      return;
    }
    event.preventDefault();
    active.current = next;
    sync();
    items[next].focus();
  }, [layout, spatial, sync]);

  const onFocus = useCallback((event: FocusEvent<T>) => {
    const index = itemsIn(event.currentTarget).indexOf(event.target as HTMLElement);
    if (index < 0 || index === active.current) return;
    active.current = index;
    sync();
  }, [sync]);

  return { ref, onKeyDown, onFocus };
}
