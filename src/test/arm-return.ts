import { rememberForReturn, resetFocusReturn } from "../features/shell/focus-return";

// Leaves the current history entry from a card, as the user would, and comes back to it by a traversal, so a
// focus return to this entry is pending. `slots` are what the screen kept for it. Call after the hash is set
// and before the screen under test renders.
export async function armReturn(slots: Record<string, unknown> = {}): Promise<void> {
  // jsdom delivers the events of an earlier location.hash assignment late; let them land first.
  await new Promise((resolve) => setTimeout(resolve, 20));
  armReturnNow(slots);
}

// The same without waiting, for tests that run on fake timers.
export function armReturnNow(slots: Record<string, unknown> = {}): void {
  resetFocusReturn();
  const hash = window.location.hash;
  const entry = window.history.state;
  const probe = document.createElement("main");
  probe.innerHTML = '<ul data-focus-row="probe"><li data-focus-id="probe"><a href="#/probe" data-roving-item>probe</a></li></ul>';
  document.body.append(probe);
  probe.querySelector("a")?.focus();
  Object.entries(slots).forEach(([slot, value]) => rememberForReturn(slot, value));
  window.history.pushState(null, "", "#/next/item/away");
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  probe.remove();
  window.history.replaceState(entry, "", hash);
  window.dispatchEvent(new PopStateEvent("popstate", { state: entry }));
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
