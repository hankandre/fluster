import { useEffect } from "react";
import { isTvForm } from "../shared/tv-form";
import { isTextTarget } from "../use-escape-key";

// In the TV form, Backspace outside a text field acts as Back (DESIGN.md §9): the capture-phase listener turns it
// into an Escape key event on the same target, so every Escape handler runs unchanged. On desktop it does
// nothing outside text fields (owner, 2026-11-13; P13-34).
export function useBackspaceAsEscape(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" || event.defaultPrevented || event.isComposing) return;
      if (!isTvForm()) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isTextTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      (event.target ?? document).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
      );
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
