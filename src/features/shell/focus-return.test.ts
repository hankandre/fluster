import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  currentEntryId,
  deferDefaultFocus,
  finishReturn,
  isReturning,
  readOnReturn,
  rememberForReturn,
  resetFocusReturn,
  tryRestore,
} from "./focus-return";

// Chromium's order for every hash navigation: the history change, popstate, then hashchange.
function navigate(hash: string, state: unknown, kind: "push" | "replace" | "traverse") {
  if (kind === "push") window.history.pushState(state, "", hash);
  else window.history.replaceState(state, "", hash);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
const push = (hash: string) => navigate(hash, null, "push");
const replace = (hash: string) => navigate(hash, null, "replace");

function page(rows: Record<string, string[]>): void {
  document.body.innerHTML = `<nav aria-label="Main"><a href="#/n" id="nav">Home</a></nav><main tabindex="-1">${Object.entries(rows)
    .map(
      ([row, ids]) =>
        `<ul data-focus-row="${row}">${ids.map((id) => `<li data-focus-id="${id}"><a href="#/${id}" data-roving-item data-testid="${id}">${id}</a><a href="#/d/${id}" data-roving-item data-testid="${id}-details">d</a></li>`).join("")}</ul>`,
    )
    .join("")}<button id="hero">Play</button></main>`;
}
const el = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"], #${id}`)!;

beforeEach(() => {
  window.history.replaceState(null, "", "#/next/home");
  resetFocusReturn();
  page({ Latest: ["a", "b", "c"] });
});
afterEach(() => {
  document.body.innerHTML = "";
  resetFocusReturn();
});

// Focus a card on home, open an item, return the state that Back would restore.
function leaveFrom(testId: string, to = "#/next/item/x") {
  const home = window.history.state;
  el(testId).focus();
  push(to);
  return home;
}

describe("stamping", () => {
  it("stamps the first entry and each pushed entry with a fresh id", () => {
    const first = currentEntryId();
    expect(first).toBeDefined();
    push("#/next/item/x");
    expect(currentEntryId()).toBeDefined();
    expect(currentEntryId()).not.toBe(first);
  });

  it("keeps an entry's id and other state keys across a traversal and a stamp", () => {
    window.history.replaceState({ playerFromDetail: true }, "");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    const state = window.history.state as Record<string, unknown>;
    expect(state.playerFromDetail).toBe(true);
    const id = currentEntryId();
    push("#/next/other");
    navigate("#/next/home", state, "traverse");
    expect(currentEntryId()).toBe(id);
  });

  it("re-stamps a state that carries another load's id", () => {
    push("#/next/item/x");
    window.history.replaceState({ focusEntry: "old:1" }, "");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(currentEntryId()).toBeDefined();
    expect(currentEntryId()).not.toBe("old:1");
  });

  it("gives a replaced entry a fresh id", () => {
    const before = currentEntryId();
    replace("#/next/library/l1");
    expect(currentEntryId()).not.toBe(before);
  });
});

describe("returning", () => {
  it("focuses the exact card on a traversal back", () => {
    const home = leaveFrom("b");
    page({ Latest: ["a", "b", "c"] });
    navigate("#/next/home", home, "traverse");
    expect(isReturning()).toBe(true);
    expect(tryRestore()).toBe(true);
    expect(document.activeElement).toBe(el("b"));
    expect(isReturning()).toBe(false);
  });

  it("focuses the Details part when that link was focused", () => {
    const home = leaveFrom("b-details");
    navigate("#/next/home", home, "traverse");
    expect(tryRestore()).toBe(true);
    expect(document.activeElement).toBe(el("b-details"));
  });

  it("records on click when focus does not follow", () => {
    const home = window.history.state;
    el("c").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    push("#/next/item/x");
    navigate("#/next/home", home, "traverse");
    expect(tryRestore()).toBe(true);
    expect(document.activeElement).toBe(el("c"));
  });

  it("does not arm on a push or replace to a hash that has a record", () => {
    el("b").focus();
    push("#/next/item/x");
    el("b").blur();
    push("#/next/home");
    expect(isReturning()).toBe(false);
    expect(tryRestore()).toBe(false);
    replace("#/next/home");
    expect(isReturning()).toBe(false);
    expect(document.activeElement).not.toBe(el("b"));
    expect(readOnReturn("x")).toBeUndefined();
  });

  it("keeps one record per entry for the same hash", () => {
    el("a").focus();
    const first = window.history.state;
    push("#/next/item/x");
    push("#/next/home");
    el("c").focus();
    const second = window.history.state;
    push("#/next/item/y");
    navigate("#/next/home", first, "traverse");
    tryRestore();
    expect(document.activeElement).toBe(el("a"));
    navigate("#/next/item/y", window.history.state, "traverse");
    navigate("#/next/home", second, "traverse");
    tryRestore();
    expect(document.activeElement).toBe(el("c"));
  });

  it("does not arm for an unrecorded entry", () => {
    const home = window.history.state;
    push("#/next/item/x");
    navigate("#/next/home", home, "traverse");
    expect(isReturning()).toBe(false);
  });

  it("forgets the record when a non-card in main takes focus", () => {
    const home = leaveFrom("b");
    navigate("#/next/home", home, "traverse");
    expect(isReturning()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    el("hero").focus();
    push("#/next/item/z");
    navigate("#/next/home", home, "traverse");
    expect(isReturning()).toBe(false);
  });

  it("keeps the record when the nav takes focus", () => {
    const home = leaveFrom("b");
    navigate("#/next/home", home, "traverse");
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    el("nav").focus();
    push("#/next/item/z");
    navigate("#/next/home", home, "traverse");
    expect(isReturning()).toBe(true);
  });

  it("cancels on keydown and pointerdown", () => {
    const home = leaveFrom("b");
    navigate("#/next/home", home, "traverse");
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    expect(isReturning()).toBe(false);
    push("#/next/item/x");
    navigate("#/next/home", home, "traverse");
    expect(isReturning()).toBe(true);
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(isReturning()).toBe(false);
  });

  it("cancels when the hash change lands on another entry", () => {
    const home = leaveFrom("b");
    window.history.replaceState(home, "", "#/next/home");
    window.dispatchEvent(new PopStateEvent("popstate", { state: home }));
    push("#/next/elsewhere");
    expect(isReturning()).toBe(false);
  });

  it("clears every record when the hash becomes sign-in", () => {
    const home = leaveFrom("b");
    push("#/next/sign-in");
    navigate("#/next/home", home, "traverse");
    expect(isReturning()).toBe(false);
  });

  it("drops the oldest of 51 records", () => {
    el("a").focus();
    const firstEntry = window.history.state;
    for (let index = 0; index < 50; index += 1) {
      push(`#/next/item/${index}`);
      page({ Latest: ["a", "b", "c"] });
      el("a").focus();
    }
    push("#/next/item/last");
    navigate("#/next/home", firstEntry, "traverse");
    expect(isReturning()).toBe(false);
  });

  it("finds an id with quotes", () => {
    page({ Latest: ['a"b'] });
    const link = document.querySelector<HTMLElement>("[data-roving-item]")!;
    const home = window.history.state;
    link.focus();
    push("#/next/item/x");
    navigate("#/next/home", home, "traverse");
    expect(tryRestore()).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  it("never records an href, a URL, or a token", () => {
    const home = leaveFrom("b");
    navigate("#/next/home", home, "traverse");
    rememberForReturn("season", "s1");
    const dump = JSON.stringify([window.history.state, readOnReturn("season")]);
    expect(dump).not.toMatch(/href|http|token/i);
  });
});

describe("finishing without an exact match", () => {
  function returnTo(testId: string) {
    const home = leaveFrom(testId);
    navigate("#/next/home", home, "traverse");
  }

  it("focuses the card now at the same index, clamped to the last", () => {
    returnTo("c");
    page({ Latest: ["a", "b"] });
    finishReturn();
    expect(document.activeElement).toBe(el("b"));
  });

  it("falls back to the deferred default when the row is gone", () => {
    returnTo("b");
    page({ Other: ["z"] });
    expect(deferDefaultFocus(el("hero"))).toBe(true);
    finishReturn();
    expect(document.activeElement).toBe(el("hero"));
  });

  it("does nothing when focus already sits on a control", () => {
    returnTo("b");
    page({ Latest: ["a", "b"] });
    el("hero").focus();
    finishReturn();
    expect(document.activeElement).toBe(el("hero"));
    expect(isReturning()).toBe(false);
  });

  it("lets a screen focus its own default when nothing is pending", () => {
    expect(deferDefaultFocus(el("hero"))).toBe(false);
  });
});

describe("slots", () => {
  it("give a value back only on a return to the same entry", () => {
    const home = window.history.state;
    el("b").focus();
    rememberForReturn("library", { pages: 2 });
    expect(readOnReturn("library")).toBeUndefined();
    push("#/next/item/x");
    navigate("#/next/home", home, "traverse");
    expect(readOnReturn("library")).toEqual({ pages: 2 });
    expect(readOnReturn("other")).toBeUndefined();
  });
});
