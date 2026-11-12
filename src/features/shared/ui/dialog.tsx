import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./overlays.css";

interface DialogProps {
  open: boolean;
  onClose(): void;
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
  // Buttons, primary last. They sit at the bottom right.
  actions?: ReactNode;
  // The element focused on open. Point it at the safe action for a risky confirm.
  initialFocus?: RefObject<HTMLElement | null>;
  // A press on the veil closes the dialog. Turn it off for a confirm that needs an answer.
  closeOnVeil?: boolean;
  // A confirm that interrupts the user is an alertdialog.
  role?: "dialog" | "alertdialog";
}

const TABBABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Portals that must stay usable above an open dialog (the toast region, an open Picker list) opt out of the inert
// background. A dialog's own veil opts out too, so a second dialog opened on top stays usable (one modal at a time
// is the supported case).
export const DIALOG_EXEMPT_ATTRIBUTE = "data-dialog-exempt";

// Open dialogs, oldest first. Only the last one answers the document-level keys.
const openDialogs: symbol[] = [];

function isExempt(element: Element, veil: Element | null): boolean {
  return element === veil || element.hasAttribute("inert") || element.hasAttribute(DIALOG_EXEMPT_ATTRIBUTE) || element.tagName === "SCRIPT";
}

// A modal dialog in a portal. Chosen over <dialog>.showModal(): jsdom does not implement it, so the
// behaviour could not be tested here, and its WebKitGTK behaviour is unverified. The rest of the page
// is made inert, Tab is trapped, Escape closes, and focus returns to the opener.
export function Dialog({ open, onClose, title, icon, children, actions, initialFocus, closeOnVeil = true, role = "dialog" }: DialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const veil = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inerted: Element[] = [];
    const makeInert = (element: Element) => {
      if (isExempt(element, veil.current)) return;
      element.setAttribute("inert", "");
      inerted.push(element);
    };
    Array.from(document.body.children).forEach(makeInert);
    // Anything added to the page while the dialog is open (another portal) is inert too.
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => node instanceof Element && makeInert(node)));
    });
    observer.observe(document.body, { childList: true });
    const self = Symbol("dialog");
    openDialogs.push(self);
    // Escape and Tab still work when focus has dropped to the page (a focused child unmounted).
    const onDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== self || event.defaultPrevented) return;
      const inside = panel.current?.contains(document.activeElement) ?? false;
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      } else if (event.key === "Tab" && !inside) {
        event.preventDefault();
        (panel.current?.querySelector<HTMLElement>(TABBABLE) ?? panel.current)?.focus();
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown);
    const first = panel.current?.querySelector<HTMLElement>(TABBABLE);
    (initialFocus?.current ?? first ?? panel.current)?.focus();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onDocumentKeyDown);
      openDialogs.splice(openDialogs.indexOf(self), 1);
      inerted.forEach((element) => element.removeAttribute("inert"));
      if (opener?.isConnected) opener.focus();
    };
  }, [open, initialFocus]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      close.current();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const stops = Array.from(panel.current.querySelectorAll<HTMLElement>(TABBABLE));
    if (stops.length === 0) {
      event.preventDefault();
      panel.current.focus();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      ref={veil}
      className="ui-dialog-veil"
      {...{ [DIALOG_EXEMPT_ATTRIBUTE]: "" }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (closeOnVeil) {
          close.current();
        } else {
          // Keep focus in the dialog so Escape and Tab keep working.
          event.preventDefault();
          panel.current?.focus();
        }
      }}
    >
      <div
        ref={panel}
        className="ui-dialog"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="ui-dialog-head">
          {icon ? <span className="ui-dialog-icon" aria-hidden="true">{icon}</span> : null}
          <h2 className="ui-dialog-title" id={titleId}>{title}</h2>
        </div>
        {children ? <div className="ui-dialog-body" id={bodyId}>{children}</div> : null}
        {actions ? <div className="ui-dialog-actions">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
