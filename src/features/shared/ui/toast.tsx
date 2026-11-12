import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { Button } from "./button";
import { DIALOG_EXEMPT_ATTRIBUTE } from "./dialog";
import "./overlays.css";

// At most this many toasts show at once; the oldest leave first.
export const MAX_TOASTS = 3;

export type ToastTone = "info" | "ok" | "error";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onAction(): void };
}

interface ToastEntry extends ToastInput {
  id: number;
}

type ToastAction = { type: "add"; entry: ToastEntry } | { type: "dismiss"; id: number } | { type: "clear" };

export function toastReducer(entries: ToastEntry[], action: ToastAction): ToastEntry[] {
  switch (action.type) {
    case "add": {
      // The same sentence is shown once: the new one replaces the old.
      const rest = entries.filter((entry) => !(entry.message === action.entry.message && (entry.tone ?? "info") === (action.entry.tone ?? "info")));
      return [...rest, action.entry].slice(-MAX_TOASTS);
    }
    case "dismiss":
      return entries.filter((entry) => entry.id !== action.id);
    case "clear":
      return [];
    default:
      return entries;
  }
}

interface ToastApi {
  show(input: ToastInput): number;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider.");
  return api;
}

const ICONS = { info: Info, ok: CircleCheck, error: CircleAlert } as const;

// Toasts sit bottom left and never take focus. Errors stay until dismissed; the rest leave after
// `durationMs`, and wait while the pointer or focus is on them. While `suppressed` (the player, where the
// OSD speaks), toasts are dropped, not held, so a stale one never shows after playback.
export function ToastProvider({ children, durationMs = 5_000, suppressed = false }: { children: ReactNode; durationMs?: number; suppressed?: boolean }) {
  const [entries, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(1);
  const region = useRef<HTMLDivElement>(null);
  const lastOutside = useRef<HTMLElement | null>(null);
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;

  useEffect(() => {
    if (suppressed) dispatch({ type: "clear" });
  }, [suppressed]);

  // Remembers where focus was, so dismissing a focused toast gives it back.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !region.current?.contains(event.target)) lastOutside.current = event.target;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const dismiss = useCallback((id: number) => {
    if (region.current?.contains(document.activeElement) && lastOutside.current?.isConnected) lastOutside.current.focus();
    dispatch({ type: "dismiss", id });
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = nextId.current;
    nextId.current += 1;
    if (suppressedRef.current) return id;
    dispatch({ type: "add", entry: { ...input, id } });
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const shown = suppressed ? [] : entries;
  const polite = shown.filter((entry) => entry.tone !== "error");
  const alerts = shown.filter((entry) => entry.tone === "error");

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div ref={region} className="ui-toast-region" {...{ [DIALOG_EXEMPT_ATTRIBUTE]: "" }}>
          <div role="status" aria-live="polite" className="ui-toast-list">
            {polite.map((entry) => <ToastItem key={entry.id} entry={entry} durationMs={durationMs} onDismiss={dismiss} />)}
          </div>
          {/* Mounted only while an error shows: an alert announces on insertion, and an empty one on every page would match every alert query. */}
          {alerts.length > 0 ? (
            <div role="alert" className="ui-toast-list">
              {alerts.map((entry) => <ToastItem key={entry.id} entry={entry} durationMs={durationMs} onDismiss={dismiss} />)}
            </div>
          ) : null}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ entry, durationMs, onDismiss }: { entry: ToastEntry; durationMs: number; onDismiss(id: number): void }) {
  const tone = entry.tone ?? "info";
  const Icon = ICONS[tone];
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (tone === "error" || paused) return;
    const timer = window.setTimeout(() => onDismiss(entry.id), durationMs);
    return () => window.clearTimeout(timer);
  }, [tone, paused, durationMs, entry.id, onDismiss]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onDismiss(entry.id);
  }

  return (
    <div
      className="ui-toast"
      data-tone={tone}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className="ui-toast-icon" aria-hidden="true" size={20} />
      <p className="ui-toast-message">{entry.message}</p>
      {entry.action ? (
        <Button
          variant="quiet"
          onClick={() => {
            entry.action?.onAction();
            onDismiss(entry.id);
          }}
        >
          {entry.action.label}
        </Button>
      ) : null}
      <Button variant="icon" aria-label="Dismiss" onClick={() => onDismiss(entry.id)}>
        <X aria-hidden="true" size={18} />
      </Button>
    </div>
  );
}
