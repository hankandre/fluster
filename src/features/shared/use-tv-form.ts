import { useSyncExternalStore } from "react";
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
