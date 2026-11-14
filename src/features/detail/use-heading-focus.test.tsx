import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { armReturnNow } from "../../test/arm-return";
import { finishReturn, isReturning, resetFocusReturn } from "../shell/focus-return";
import { useHeadingFocus } from "./use-heading-focus";

function Page({ settled }: { settled: boolean }) {
  const heading = useHeadingFocus(settled);
  return <main><h1 ref={heading} tabIndex={-1}>Title</h1></main>;
}

beforeEach(() => {
  window.history.replaceState(null, "", "#/next/item/x");
});
afterEach(() => {
  cleanup();
  resetFocusReturn();
});

describe("useHeadingFocus", () => {
  it("keeps focus on a card that a return has already restored", () => {
    const { rerender } = render(
      <>
        <Page settled={false} />
        <main><ul data-focus-row="r"><li data-focus-id="a"><a href="#/a" data-roving-item>a</a></li></ul></main>
      </>,
    );
    const card = document.querySelector<HTMLElement>("[data-roving-item]")!;
    card.focus();
    rerender(
      <>
        <Page settled />
        <main><ul data-focus-row="r"><li data-focus-id="a"><a href="#/a" data-roving-item>a</a></li></ul></main>
      </>,
    );
    expect(document.activeElement).toBe(card);
  });

  it("focuses the heading once the page settles", () => {
    const { rerender, getByRole } = render(<Page settled={false} />);
    expect(document.activeElement).toBe(document.body);
    rerender(<Page settled />);
    expect(getByRole("heading")).toHaveFocus();
  });

  it("leaves the heading unfocused while a return is pending, and hands it over when the return finishes", () => {
    armReturnNow();
    expect(isReturning()).toBe(true);
    const { getByRole } = render(<Page settled />);
    expect(document.activeElement).toBe(document.body);
    act(() => finishReturn());
    expect(getByRole("heading")).toHaveFocus();
  });
});
