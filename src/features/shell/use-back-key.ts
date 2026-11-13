import { useEffect } from "react";
import { currentNavEntry } from "../shared/ui/app-nav";
import { isTvForm } from "../shared/tv-form";
import { isTextTarget } from "../use-escape-key";

const HOME_HASH = "#/next/home";
export const MODAL_LAYER = '[role="dialog"][aria-modal="true"], [role="alertdialog"], .ui-picker-list[role="listbox"], .ui-picker-list[role="menu"]';
const NAV_CURRENT = 'nav[aria-label="Main"] [aria-current="page"], nav[aria-label="Main"] [data-roving-item][tabindex="0"]';

// True once this tab has pushed a history entry, so history.back() stays inside the app. A replace
// (first-load normalisation, redirects) fires hashchange too but leaves history.length unchanged.
let navigatedInApp = false;
let lastHistoryLength = typeof window !== "undefined" ? window.history.length : 0;
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const length = window.history.length;
    if (length > lastHistoryLength) navigatedInApp = true;
    lastHistoryLength = length;
  });
}

// Screen-level Back for signed-in, non-player routes (DESIGN.md §9). Registered on window (bubble), so it
// runs after every document handler: a layer, field, or page that used Escape has already prevented it.
// Non-root screens go back; on a root tab in the TV form, focus goes to the nav's current entry.
export function useBackKey(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isTextTarget(event.target)) return;
      if (document.querySelector(MODAL_LAYER)) return;
      const hash = window.location.hash;
      if (currentNavEntry(hash) !== undefined) {
        if (!isTvForm()) return;
        const nav = document.querySelector<HTMLElement>('nav[aria-label="Main"]');
        if (nav?.contains(document.activeElement)) return;
        const entry = document.querySelector<HTMLElement>(NAV_CURRENT);
        if (!entry) return;
        event.preventDefault();
        entry.focus();
        return;
      }
      event.preventDefault();
      if (navigatedInApp) window.history.back();
      else window.location.hash = HOME_HASH;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
