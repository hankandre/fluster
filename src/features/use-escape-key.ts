import { useEffect, useRef } from "react";

export const TEXT_FIELDS = "textarea, input:not([type=range], [type=checkbox], [type=radio], [type=button], [type=submit], [type=reset])";

// True when the key event's target takes typed text (a text field or editable content).
export function isTextTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches(TEXT_FIELDS) || target.closest('[contenteditable]:not([contenteditable="false"])') !== null);
}

// Runs `onEscape` when Escape is pressed anywhere on the page, unless a text
// field or another handler already used it. With `enabled: false` the hook
// leaves the key alone (no preventDefault), so a later handler can use it.
export function useEscapeKey(onEscape: () => void, options?: { enabled?: boolean }): void {
  const handler = useRef(onEscape);
  const enabled = useRef(true);

  useEffect(() => {
    handler.current = onEscape;
    enabled.current = options?.enabled !== false;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !enabled.current) return;
      if (isTextTarget(event.target)) return;
      event.preventDefault();
      handler.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
