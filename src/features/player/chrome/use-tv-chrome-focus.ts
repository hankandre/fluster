import { useEffect, type RefObject } from "react";
import { isTvForm } from "../../shared/tv-form";

type Zone = "top" | "scrubber" | "controls" | "prompt";

const ZONE_ORDER: Zone[] = ["top", "scrubber", "controls", "prompt"];
const SCRUBBER = 'input[type="range"][aria-label="Playback position"]';

function zoneElement(root: HTMLElement, zone: Zone): HTMLElement | null {
  switch (zone) {
    case "top":
      return root.querySelector<HTMLElement>(".player-top-bar");
    case "scrubber":
      return root.querySelector<HTMLElement>(SCRUBBER);
    case "controls":
      return root.querySelector<HTMLElement>(".control-row");
    case "prompt":
      return root.querySelector<HTMLElement>(".player-prompt");
  }
}

function controlsIn(zone: HTMLElement): HTMLElement[] {
  return Array.from(zone.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]"));
}

function zoneOf(root: HTMLElement, target: HTMLElement): Zone | undefined {
  return ZONE_ORDER.find((zone) => zoneElement(root, zone)?.contains(target));
}

// Focuses a zone's remembered control, else its first (Play or Pause for the control row).
function enter(root: HTMLElement, zone: Zone, last: Map<Zone, HTMLElement>): boolean {
  const element = zoneElement(root, zone);
  if (!element) return false;
  if (zone === "scrubber") {
    element.focus();
    return true;
  }
  const controls = controlsIn(element);
  const remembered = last.get(zone);
  const target =
    remembered && controls.includes(remembered)
      ? remembered
      : (zone === "controls" ? controls.find((control) => control.dataset.role === "play") : undefined) ?? controls[0];
  if (!target) return false;
  target.focus();
  return true;
}

// Focuses the scrubber or Play or Pause; used by the wake key action.
export function focusChromeControl(root: HTMLElement | null, target: "scrubber" | "play"): void {
  if (!root) return;
  if (target === "scrubber") root.querySelector<HTMLElement>(SCRUBBER)?.focus();
  else root.querySelector<HTMLElement>('.control-row [data-role="play"]')?.focus();
}

// TV form: arrows inside the chrome move between three zones (top bar, scrubber, control row), plus a
// visible Up Next card below them. Each zone remembers its last control. Left and Right move among a zone's
// controls; the scrubber's own handler seeks (DESIGN.md 7.14). A sheet is outside the zones, so its lists keep
// their arrows.
export function useTvChromeFocus(region: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = region.current;
    if (!root) return undefined;
    const last = new Map<Zone, HTMLElement>();
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      const zone = zoneOf(root, target);
      if (zone && zone !== "scrubber") last.set(zone, target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTvForm() || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      const zone = zoneOf(root, target);
      if (!zone) return;
      switch (event.key) {
        case "ArrowUp":
        case "ArrowDown": {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          let index = ZONE_ORDER.indexOf(zone) + step;
          while (index >= 0 && index < ZONE_ORDER.length) {
            if (enter(root, ZONE_ORDER[index], last)) break;
            index += step;
          }
          return;
        }
        case "ArrowLeft":
        case "ArrowRight": {
          if (zone === "scrubber") return;
          event.preventDefault();
          const element = zoneElement(root, zone);
          if (!element) return;
          const controls = controlsIn(element);
          const next = controls.indexOf(target) + (event.key === "ArrowRight" ? 1 : -1);
          if (next >= 0 && next < controls.length) controls[next].focus();
          return;
        }
      }
    };
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [region]);
}
