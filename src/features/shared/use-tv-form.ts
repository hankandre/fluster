import { useCallback, useSyncExternalStore } from "react";
import { isTvForm } from "./tv-form";

const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => listeners.forEach((notify) => notify()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-form"] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}

// True in the 10-foot form; re-renders when <html data-form> changes.
export function useTvForm(): boolean {
  return useSyncExternalStore(subscribe, isTvForm, () => false);
}

// A ref callback for a screen's primary action: in the TV form it takes focus when it mounts (DESIGN.md 9,
// "Opening a screen focuses its primary action"), unless focus already sits on a control in the page.
export function useTvPrimaryRef(): (element: HTMLElement | null) => void {
  return useCallback((element: HTMLElement | null) => {
    if (!element || !isTvForm()) return;
    const active = document.activeElement;
    const free =
      !active ||
      active === document.body ||
      active.matches("h1, h2, main") ||
      active.closest('nav[aria-label="Main"]') !== null;
    if (free) element.focus();
  }, []);
}
