import { ROUTE_REPLACED_EVENT } from "../routes";

// Focus after Back (DESIGN.md 9): remembers, per history entry, the last card or episode row the user focused,
// and focuses it again when the user returns to that entry. Memory only; the one thing written to
// history.state is an opaque entry id. Never store an href, a token, or anything from the server here.

export interface FocusRecord {
  // The `data-focus-row` of the row or grid that held the item.
  row: string;
  // The item's `data-focus-id`.
  id: string;
  // Which `[data-roving-item]` inside the item had focus (an episode row's Details link is 1).
  part: number;
  // The item's position among the row's `[data-focus-id]` elements.
  index: number;
}

interface PendingReturn {
  entry: string;
  // Absent for a return to an entry that had a scroll position but no focused card.
  record?: FocusRecord;
  // Where the window was scrolled when the entry was left.
  scrollY?: number;
  // True once the scroll has been applied.
  scrolled?: boolean;
  // True once the hashchange of this traversal has been seen, so the destination screen is rendering.
  landed: boolean;
  // The screen's own opening focus target, deferred while the return is pending.
  deferred?: HTMLElement;
}

const MAX_ENTRIES = 50;
const SIGN_IN_HASH = "#/next/sign-in";
const FREE_FOCUS = ["body", "main"];

const loadId = Math.random().toString(36).slice(2);
let counter = 0;
const records = new Map<string, FocusRecord>();
const slots = new Map<string, unknown>();
const scrolls = new Map<string, number>();
let pending: PendingReturn | undefined;
// The record of a card just restored, until the screen has settled: a refetch can drop the card afterwards.
let settling: FocusRecord | undefined;
let lastHash = typeof window !== "undefined" ? window.location.hash : "";
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function setPending(next: PendingReturn | undefined): void {
  if (pending === next) return;
  pending = next;
  notify();
}

function entryIdOf(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const id = (state as { focusEntry?: unknown }).focusEntry;
  return typeof id === "string" && id.startsWith(`${loadId}:`) ? id : undefined;
}

export function currentEntryId(): string | undefined {
  return entryIdOf(window.history.state);
}

// Gives the current history entry an id when it has none from this load. It keeps the entry's other state keys.
// A later replaceState that drops `focusEntry` makes the entry non-restorable, which is a safe failure.
export function stampEntry(): void {
  if (currentEntryId() !== undefined) return;
  const state: unknown = window.history.state;
  const base = typeof state === "object" && state !== null ? state : {};
  counter += 1;
  window.history.replaceState({ ...base, focusEntry: `${loadId}:${counter}` }, "");
}

function capSet<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

function recordFrom(target: Element): FocusRecord | undefined {
  const item = target.closest<HTMLElement>("[data-focus-id]");
  const rowElement = item?.closest<HTMLElement>("[data-focus-row]");
  if (!item || !rowElement) return undefined;
  const parts = Array.from(item.querySelectorAll("[data-roving-item]"));
  const part = Math.max(0, parts.indexOf(target.closest("[data-roving-item]") as Element));
  const index = Array.from(rowElement.querySelectorAll("[data-focus-id]")).indexOf(item);
  return { row: rowElement.dataset.focusRow ?? "", id: item.dataset.focusId ?? "", part, index: Math.max(0, index) };
}

function rememberScroll(): void {
  if (pending) return;
  const entry = currentEntryId();
  if (entry !== undefined) capSet(scrolls, entry, Math.round(window.scrollY));
}

function remember(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const entry = currentEntryId();
  if (entry === undefined) return;
  const record = recordFrom(target);
  if (record) {
    capSet(records, entry, record);
    rememberScroll();
  } else if (target.closest("main")) {
    records.delete(entry);
    scrolls.delete(entry);
  }
}

function inRow(row: string): HTMLElement | null {
  return document.querySelector("main")?.querySelector<HTMLElement>(`[data-focus-row="${CSS.escape(row)}"]`) ?? null;
}

// Focuses without scrolling, then scrolls "nearest", so scroll-padding, a sticky toolbar, and TV safe insets
// are honoured. Horizontal rows need the inline part.
function focusItem(item: Element | undefined, part: number): boolean {
  const targets = item?.querySelectorAll<HTMLElement>("[data-roving-item]");
  const target = targets?.[part] ?? targets?.[0];
  if (!target) return false;
  target.focus({ preventScroll: true });
  // Always: "nearest" is a no-op for a visible target, but it honours scroll-padding and safe insets.
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

// Applies the remembered scroll position once the page is tall enough to hold it. True when it has been
// applied (or there is nothing to apply). With `clamp`, a short page is scrolled to its end instead of waiting.
export function tryRestoreScroll(clamp = false): boolean {
  if (!pending || currentEntryId() !== pending.entry) return false;
  if (pending.scrollY === undefined || pending.scrolled) return true;
  const room = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (room < pending.scrollY && !clamp) return false;
  pending.scrolled = true;
  window.scrollTo({ top: Math.min(pending.scrollY, room), behavior: "instant" });
  return true;
}

export function isReturning(): boolean {
  return pending !== undefined;
}

// Focuses the remembered item when it has rendered. True when it did, and the return is over.
// The card is not focused, and so the return does not end, until the scroll has been applied: a card can
// render before the page reaches its remembered height, and ending the return then would lose the scroll.
export function tryRestore(): boolean {
  if (!pending || currentEntryId() !== pending.entry) return false;
  if (!tryRestoreScroll()) return false;
  if (!pending.record) return false;
  const { row, id, part } = pending.record;
  const item = inRow(row)?.querySelector(`[data-focus-id="${CSS.escape(id)}"]`) ?? undefined;
  if (!focusItem(item ?? undefined, part)) return false;
  settling = pending.record;
  setPending(undefined);
  return true;
}

export function isSettling(): boolean {
  return settling !== undefined;
}

export function endSettling(): void {
  if (settling === undefined) return;
  settling = undefined;
  notify();
}

// The restored card is gone after the screen's refetch: the same place in the same row, as finishReturn does.
export function settleFocus(): void {
  const record = settling;
  endSettling();
  if (!record || !focusIsFree()) return;
  const items = inRow(record.row)?.querySelectorAll("[data-focus-id]");
  if (items && items.length > 0) focusItem(items[Math.min(record.index, items.length - 1)], 0);
}

function focusIsFree(): boolean {
  const active = document.activeElement;
  return !active || FREE_FOCUS.includes(active.tagName.toLowerCase());
}

// The screen has settled and the exact item is not there: the same place in the same row, else the screen's
// own opening focus. Does nothing to a focus that already sits on a control.
export function finishReturn(force = false): void {
  const current = pending;
  if (!current || (!current.landed && !force)) return;
  tryRestoreScroll(true);
  setPending(undefined);
  if (!focusIsFree()) return;
  const items = current.record ? inRow(current.record.row)?.querySelectorAll("[data-focus-id]") : undefined;
  if (current.record && items && items.length > 0) {
    focusItem(items[Math.min(current.record.index, items.length - 1)], 0);
    return;
  }
  if (current.deferred?.isConnected) current.deferred.focus();
}

// A screen's opening focus calls this first. While a return is pending it keeps the element for later and
// returns true, so the caller does not focus it.
export function deferDefaultFocus(element: HTMLElement | null | undefined): boolean {
  if (!pending) return false;
  if (element) pending.deferred = element;
  return true;
}

function slotKey(slot: string): string | undefined {
  const entry = currentEntryId();
  return entry === undefined ? undefined : `${entry}|${slot}`;
}

// Keeps a screen's own state (sort, filters, pages, season) for the current entry, to give back on a return.
export function rememberForReturn(slot: string, value: unknown): void {
  const key = slotKey(slot);
  if (key !== undefined) capSet(slots, key, value);
}

// The value kept for the current entry, only while a return to that entry is pending.
export function readOnReturn(slot: string): unknown {
  const key = slotKey(slot);
  if (key === undefined || !pending || pending.entry !== currentEntryId()) return undefined;
  return slots.get(key);
}

export function subscribeReturn(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingReturn(): object | undefined {
  return pending;
}

export function resetFocusReturn(): void {
  settling = undefined;
  records.clear();
  slots.clear();
  scrolls.clear();
  setPending(undefined);
  lastHash = window.location.hash;
  stampEntry();
}

function onPopState(event: PopStateEvent): void {
  const entry = entryIdOf(event.state);
  const record = entry === undefined ? undefined : records.get(entry);
  const scrollY = entry === undefined ? undefined : scrolls.get(entry);
  // A push or a replace lands on an unstamped entry; only a traversal to a stamped one restores. Without a
  // hash change no screen re-renders, so there is nothing to wait for.
  settling = undefined;
  const moved = window.location.hash !== lastHash;
  // A hashchange can arrive after a quick second traversal, so each popstate also moves the mark.
  lastHash = window.location.hash;
  if (entry !== undefined && (record || scrollY !== undefined) && moved) setPending({ entry, record, scrollY, landed: false });
  else setPending(undefined);
}

function onHashChange(): void {
  stampEntry();
  lastHash = window.location.hash;
  if (window.location.hash === SIGN_IN_HASH) {
    records.clear();
    slots.clear();
    scrolls.clear();
    setPending(undefined);
    return;
  }
  if (!pending) return;
  if (pending.entry !== currentEntryId()) setPending(undefined);
  else pending.landed = true;
}

let scrollFrame = 0;
function onScroll(): void {
  if (pending || scrollFrame !== 0) return;
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = 0;
    rememberScroll();
  });
}

if (typeof window !== "undefined") {
  // The browser's own scroll restore would fight ours.
  if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  stampEntry();
  window.addEventListener(ROUTE_REPLACED_EVENT, () => {
    lastHash = window.location.hash;
  });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("popstate", onPopState);
  window.addEventListener("hashchange", onHashChange);
  document.addEventListener("focusin", (event) => remember(event.target), true);
  document.addEventListener("click", (event) => remember(event.target), true);
  // The user has taken over: stop waiting.
  const takeOver = () => {
    setPending(undefined);
    endSettling();
  };
  document.addEventListener("keydown", takeOver, true);
  document.addEventListener("pointerdown", takeOver, true);
  document.addEventListener("wheel", takeOver, { capture: true, passive: true });
  document.addEventListener("touchstart", takeOver, { capture: true, passive: true });
}
