import { useEffect } from "react";
import { isTvForm } from "../shared/tv-form";
import { isTextTarget } from "../use-escape-key";
import { MODAL_LAYER } from "./use-back-key";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-roving-item]';
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// The candidate to focus for an arrow key: among boxes whose centre lies in the arrow's half-plane, the one
// with the smallest primary distance (edge to edge) plus twice the perpendicular distance. A tie goes to the
// earlier one (DOM order). Returns the index into `boxes`, or undefined.
export function pickArrowTarget(key: string, from: Box, boxes: Box[]): number | undefined {
  const centre = (box: Box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });
  const origin = centre(from);
  let best: number | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  boxes.forEach((box, index) => {
    const point = centre(box);
    let primary: number;
    let perpendicular: number;
    switch (key) {
      case "ArrowRight":
        if (point.x <= origin.x) return;
        primary = Math.max(0, box.left - from.right);
        perpendicular = Math.abs(point.y - origin.y);
        break;
      case "ArrowLeft":
        if (point.x >= origin.x) return;
        primary = Math.max(0, from.left - box.right);
        perpendicular = Math.abs(point.y - origin.y);
        break;
      case "ArrowDown":
        if (point.y <= origin.y) return;
        primary = Math.max(0, box.top - from.bottom);
        perpendicular = Math.abs(point.x - origin.x);
        break;
      case "ArrowUp":
        if (point.y >= origin.y) return;
        primary = Math.max(0, from.top - box.bottom);
        perpendicular = Math.abs(point.x - origin.x);
        break;
      default:
        return;
    }
    const score = primary + 2 * perpendicular;
    if (score < bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

function rendered(element: HTMLElement): boolean {
  if (element.closest("[inert], [aria-hidden='true'], [hidden]")) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || element.getClientRects().length > 0;
}

// The TV form has no Tab key. When no roving list, picker, slider, or search box used an arrow key, this
// moves focus geometrically to the nearest control in that direction (DESIGN.md 9). Active only in the TV
// form; inside the player surface (data-tv-own-arrows) the chrome owns the arrows.
export function useTvArrowFallback(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!ARROWS.has(event.key) || event.defaultPrevented || !isTvForm()) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-tv-own-arrows]")) return;
      if (isTextTarget(target) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;
      const layers = document.querySelectorAll(MODAL_LAYER);
      const scope: ParentNode = layers.length > 0 ? layers[layers.length - 1] : document;
      const nav = document.querySelector<HTMLElement>('header.app-nav[data-hidden="true"]');
      const candidates = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element !== target && rendered(element) && !nav?.contains(element) && !element.closest("nav[aria-label='Main']"),
      );
      const picked = pickArrowTarget(event.key, target.getBoundingClientRect(), candidates.map((element) => element.getBoundingClientRect()));
      if (picked === undefined) {
        // Nothing above: Up reaches the nav's current entry.
        if (event.key !== "ArrowUp" || layers.length > 0) return;
        const entry = document.querySelector<HTMLElement>('nav[aria-label="Main"] [data-roving-item][tabindex="0"]');
        if (!entry || entry.contains(target)) return;
        event.preventDefault();
        entry.focus();
        return;
      }
      event.preventDefault();
      candidates[picked].focus();
      candidates[picked].scrollIntoView?.({ block: "nearest" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
