import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "../../shared/ui";
import { useTvForm } from "../../shared/use-tv-form";

// A focus stop for Up and Down in a keyRows sheet: a roving set is one stop (its current item has tabindex 0).
const ROW_STOP = 'button:not(:disabled):not([tabindex="-1"]), [href], [tabindex="0"]';

// Scrolls only the sheet's body so `element` is in view. scrollIntoView also scrolls ancestors, which slides the
// clipped player page sideways in WebKit while the sheet mounts off the right edge.
export function revealInBody(body: HTMLElement, element: HTMLElement): void {
  const within = body.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  if (box.top < within.top) body.scrollTop -= within.top - box.top;
  else if (box.bottom > within.bottom) body.scrollTop += box.bottom - within.bottom;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])';

// A non-modal sheet fixed to the right edge. Video keeps playing and nothing
// is made inert, so it is not built on Dialog. It does not handle Escape: the
// player's key handler closes it. On open, focus moves into its content (or
// Close when it has none); on close, focus
// returns to where it was when that element is still on the page.
export function PlayerSheet({ id, label, title, onClose, initialFocus, closeRef, scrollLabel, keyRows, children }: {
  id?: string;
  label: string;
  title: string;
  onClose(): void;
  // The element to focus on open: a ref, or "close" for the Close button.
  // Defaults to the first focusable element of the content.
  initialFocus?: RefObject<HTMLElement | null> | "close";
  // Lets the content move focus to Close, for example when its own button goes away.
  closeRef?: RefObject<HTMLButtonElement | null>;
  // Makes the body a focus stop that scrolls with the arrow keys, so content
  // below the fold can be reached without a pointer (the TV form).
  scrollLabel?: string;
  // Rows content (the Settings sheet): Up and Down step through Close and the body's focus stops, in the desktop and
  // TV forms. A roving set is one stop and moves inside itself first.
  keyRows?: boolean;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const tv = useTvForm();

  // TV form, scrolling sheets only: Up and Down step through Close, the body's buttons, and the body, because
  // a remote has no Tab. In the body, arrows scroll it and only Up at the very top steps back.
  const onRowsKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const root = sheet.current;
    const body = root?.querySelector<HTMLElement>(".player-sheet-body");
    const close = root?.querySelector<HTMLElement>(".player-sheet-head button");
    const target = event.target;
    // A Picker list in a portal reaches here through the React tree but is not in the sheet.
    if (!root || !body || !close || !(target instanceof HTMLElement) || !root.contains(target)) return;
    const stops = [close, ...body.querySelectorAll<HTMLElement>(ROW_STOP)];
    const down = event.key === "ArrowDown";
    const index = stops.indexOf(target);
    let next: HTMLElement | undefined;
    if (index >= 0) {
      next = stops[index + (down ? 1 : -1)];
    } else {
      // A heading is not a stop: Down goes to the first stop after it, Up to the last one before it.
      const after = (stop: HTMLElement) => Boolean(target.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING);
      next = down ? stops.find(after) : stops.filter((stop) => !after(stop) && !stop.contains(target)).at(-1);
    }
    event.preventDefault();
    if (!next) return;
    next.focus({ preventScroll: true });
    if (body.contains(next)) revealInBody(body, next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (keyRows) {
      onRowsKeyDown(event);
      return;
    }
    if (!tv || !scrollLabel) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const root = sheet.current;
    const body = root?.querySelector<HTMLElement>(".player-sheet-body");
    const close = root?.querySelector<HTMLElement>(".player-sheet-head button");
    if (!root || !body || !close) return;
    const stops = [close, ...body.querySelectorAll<HTMLElement>("button:not(:disabled)"), body];
    const index = stops.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    if (event.target === body && (event.key === "ArrowDown" || body.scrollTop > 0)) return;
    const next = stops[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus({ preventScroll: true });
    if (next !== body && body.contains(next)) revealInBody(body, next);
  };

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = sheet.current?.querySelector<HTMLElement>(".player-sheet-body");
    const target = initialFocus === "close"
      ? sheet.current?.querySelector<HTMLElement>(".player-sheet-head button")
      : initialFocus?.current ?? body?.querySelector<HTMLElement>(FOCUSABLE) ?? sheet.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
    return () => {
      if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open: a later initialFocus must not steal focus back
  }, []);

  return (
    <section ref={sheet} id={id} className="player-sheet" aria-label={label} data-chrome-zone="" data-key-rows={keyRows ? "" : undefined} onKeyDown={onKeyDown}>
      <header className="player-sheet-head">
        <h2>{title}</h2>
        <Button variant="icon" aria-label="Close" ref={closeRef} onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      {scrollLabel ? (
        <div className="player-sheet-body" role="group" aria-label={scrollLabel} tabIndex={0} data-key-scroll="">
          {children}
        </div>
      ) : (
        <div className="player-sheet-body">{children}</div>
      )}
    </section>
  );
}
