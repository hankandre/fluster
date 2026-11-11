import { useEffect } from "react";
import { SEARCH_ROUTE } from "../search/search-route";
import { TEXT_FIELDS } from "../use-escape-key";

const EDITABLE = '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const KEEPS_ITS_KEYS = '[role="dialog"], [role="listbox"], [role="menu"]';

// Pressing "/" outside a text field focuses the search field, or opens Search when it is not on screen (DESIGN.md 9).
export function useSearchShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || target.closest(EDITABLE) || target.matches(TEXT_FIELDS) || target.closest(KEEPS_ITS_KEYS)) return;
      }
      event.preventDefault();
      const field = document.querySelector<HTMLInputElement>("[data-search-field]");
      if (field) {
        field.focus();
        field.select();
      } else {
        window.location.hash = SEARCH_ROUTE;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
