import { useEffect, useRef, type KeyboardEvent } from "react";
import { HOLD_MS } from "../hold-key";
import { isTvForm } from "../tv-form";

function isPlainEnter(event: KeyboardEvent): boolean {
  return event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

// After a hold opens details, swallow Enter until its keyup so a remote's auto-repeat cannot press Play on the
// page that opened.
function swallowEnterUntilKeyUp(): void {
  const onKeyDown = (event: globalThis.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onKeyUp = (event: globalThis.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
  };
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
}

// TV form only: on an anchor where Enter plays, a press plays on release and a hold of HOLD_MS opens
// `detailsHref` (DESIGN.md 7.5, D15 B). Everywhere else the handlers do nothing.
export function useHoldOk(detailsHref: string | undefined) {
  const timer = useRef<number | undefined>(undefined);

  function clear() {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  }

  useEffect(() => clear, []);

  return {
    onKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
      if (!detailsHref || !isTvForm() || !isPlainEnter(event)) return;
      event.preventDefault();
      if (event.repeat || timer.current !== undefined) return;
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        swallowEnterUntilKeyUp();
        window.location.hash = detailsHref;
      }, HOLD_MS);
    },
    onKeyUp(event: KeyboardEvent<HTMLAnchorElement>) {
      if (!detailsHref || !isTvForm() || event.key !== "Enter") return;
      if (timer.current === undefined) return;
      clear();
      event.currentTarget.click();
    },
    onBlur() {
      clear();
    },
  };
}
