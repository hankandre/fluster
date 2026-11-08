import { useEffect, useRef } from "react";

export const TEXT_FIELDS = "textarea, input:not([type=range], [type=checkbox], [type=radio], [type=button], [type=submit], [type=reset])";

// Runs `onEscape` when Escape is pressed anywhere on the page, unless a text
// field or another handler already used it.
export function useEscapeKey(onEscape: () => void): void {
  const handler = useRef(onEscape);

  useEffect(() => {
    handler.current = onEscape;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches(TEXT_FIELDS))) return;
      event.preventDefault();
      handler.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
