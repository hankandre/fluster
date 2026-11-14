import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { armReturnNow } from "../../test/arm-return";
import { deferDefaultFocus, isReturning, resetFocusReturn } from "./focus-return";
import { RETURN_WAIT_MS, useFocusReturn } from "./use-focus-return";

function Driver() {
  useFocusReturn();
  return null;
}

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Driver />
    </QueryClientProvider>,
  );
}

// armReturnNow records a card named "probe" in the row "probe", then returns to this entry.
function screenWith(...ids: string[]) {
  const main = document.createElement("main");
  main.innerHTML = `<ul data-focus-row="probe">${ids.map((id) => `<li data-focus-id="${id}"><a href="#/x" data-roving-item>${id}</a></li>`).join("")}</ul>`;
  document.body.append(main);
  return main;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "#/next/home");
  armReturnNow();
});
afterEach(() => {
  cleanup();
  document.querySelectorAll("main").forEach((node) => node.remove());
  resetFocusReturn();
  vi.useRealTimers();
});

describe("useFocusReturn scroll", () => {
  const scrollTo = vi.fn();
  let scrollHeight = 5000;

  beforeEach(() => {
    scrollTo.mockClear();
    scrollHeight = 5000;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: () => scrollHeight });
    resetFocusReturn();
    armReturnNow({}, 2000);
  });

  it("scrolls as soon as the page is tall enough, then focuses the card", async () => {
    scrollHeight = 1000;
    mount();
    let main!: HTMLElement;
    await act(async () => {
      main = screenWith("probe");
      await Promise.resolve();
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(main.querySelector("a"));
    expect(isReturning()).toBe(true);
    await act(async () => {
      scrollHeight = 5000;
      main.append(document.createElement("div"));
      await Promise.resolve();
    });
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 2000, behavior: "instant" });
    expect(document.activeElement).toBe(main.querySelector("a"));
    expect(isReturning()).toBe(false);
  });
});

describe("useFocusReturn", () => {
  it("focuses the card when it renders after the return began", async () => {
    mount();
    expect(isReturning()).toBe(true);
    let main!: HTMLElement;
    await act(async () => {
      main = screenWith("probe");
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(main.querySelector("a"));
    expect(isReturning()).toBe(false);
  });

  it("moves focus to the same place in the row when the restored card leaves in a refetch", async () => {
    mount();
    let main!: HTMLElement;
    await act(async () => {
      main = screenWith("probe", "next");
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(main.querySelector("a"));
    await act(async () => {
      main.querySelector('[data-focus-id="probe"]')?.remove();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(document.activeElement).toBe(main.querySelector('[data-focus-id="next"] a'));
  });

  it("leaves focus alone when the user has moved on before the screen settles", async () => {
    mount();
    let main!: HTMLElement;
    await act(async () => {
      main = screenWith("probe", "next");
      await Promise.resolve();
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
      main.querySelector('[data-focus-id="probe"]')?.remove();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(document.activeElement).toBe(document.body);
  });

  it("waits while a section is busy, then falls back to the same place in the row", async () => {
    mount();
    const main = screenWith("other");
    main.setAttribute("aria-busy", "true");
    main.querySelector("ul")?.setAttribute("aria-busy", "true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(isReturning()).toBe(true);
    await act(async () => {
      main.querySelector("ul")?.removeAttribute("aria-busy");
      main.removeAttribute("aria-busy");
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(document.activeElement).toBe(main.querySelector("a"));
    expect(isReturning()).toBe(false);
  });

  it("gives up after the wait and focuses the deferred default", async () => {
    mount();
    const main = document.createElement("main");
    main.innerHTML = '<h1 tabindex="-1">Title</h1><div aria-busy="true"></div>';
    document.body.append(main);
    expect(deferDefaultFocus(main.querySelector("h1"))).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETURN_WAIT_MS - 1);
    });
    expect(isReturning()).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(isReturning()).toBe(false);
    expect(document.activeElement).toBe(main.querySelector("h1"));
  });
});
