import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { nearestByCentre, nextRovingIndex, useRovingFocus, type RovingLayout } from "./roving-focus";

afterEach(cleanup);

describe("nextRovingIndex", () => {
  it("moves along a row with Left and Right, and leaves Up and Down alone", () => {
    expect(nextRovingIndex("ArrowRight", 0, 3, "row", 3)).toBe(1);
    expect(nextRovingIndex("ArrowRight", 2, 3, "row", 3)).toBe(2);
    expect(nextRovingIndex("ArrowLeft", 0, 3, "row", 3)).toBe(0);
    expect(nextRovingIndex("ArrowDown", 0, 3, "row", 3)).toBeUndefined();
    expect(nextRovingIndex("ArrowUp", 1, 3, "row", 3)).toBeUndefined();
  });

  it("moves along a column with Up and Down, and leaves Left and Right alone", () => {
    expect(nextRovingIndex("ArrowDown", 0, 3, "column", 1)).toBe(1);
    expect(nextRovingIndex("ArrowUp", 1, 3, "column", 1)).toBe(0);
    expect(nextRovingIndex("ArrowDown", 2, 3, "column", 1)).toBeUndefined();
    expect(nextRovingIndex("ArrowRight", 0, 3, "column", 1)).toBeUndefined();
  });

  it("moves by a visual row in a grid", () => {
    // 7 items in rows of 3: [0 1 2] [3 4 5] [6]
    expect(nextRovingIndex("ArrowDown", 1, 7, "grid", 3)).toBe(4);
    expect(nextRovingIndex("ArrowUp", 4, 7, "grid", 3)).toBe(1);
    expect(nextRovingIndex("ArrowUp", 1, 7, "grid", 3)).toBeUndefined();
    // From above a short last row, Down lands on its last item.
    expect(nextRovingIndex("ArrowDown", 5, 7, "grid", 3)).toBe(6);
    expect(nextRovingIndex("ArrowDown", 6, 7, "grid", 3)).toBeUndefined();
    expect(nextRovingIndex("ArrowRight", 2, 7, "grid", 3)).toBe(3);
  });

  it("jumps to the ends with Home and End, and ignores other keys", () => {
    expect(nextRovingIndex("Home", 2, 5, "row", 5)).toBe(0);
    expect(nextRovingIndex("End", 0, 5, "grid", 2)).toBe(4);
    expect(nextRovingIndex("a", 0, 5, "row", 5)).toBeUndefined();
    expect(nextRovingIndex("ArrowRight", 0, 0, "row", 0)).toBeUndefined();
  });
});

function List({ layout, count }: { layout: RovingLayout; count: number }) {
  const roving = useRovingFocus<HTMLUListElement>(layout);
  return (
    <ul {...roving}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index}><a href={`#/item/${index}`} data-roving-item="">Item {index}</a></li>
      ))}
    </ul>
  );
}

function tabStops(): string[] {
  return screen.getAllByRole("link")
    .filter((link) => link.getAttribute("tabindex") === "0")
    .map((link) => link.textContent ?? "");
}

describe("useRovingFocus", () => {
  it("makes the list one Tab stop and moves focus with the arrows", () => {
    render(<List layout="row" count={3} />);
    expect(tabStops()).toEqual(["Item 0"]);

    const first = screen.getByRole("link", { name: "Item 0" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("link", { name: "Item 1" })).toHaveFocus();
    expect(tabStops()).toEqual(["Item 1"]);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(screen.getByRole("link", { name: "Item 2" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(first).toHaveFocus();
  });

  it("keeps the Tab stop on the item focused by other means", () => {
    render(<List layout="row" count={3} />);
    screen.getByRole("link", { name: "Item 2" }).focus();
    expect(tabStops()).toEqual(["Item 2"]);
  });

  it("gives new items no Tab stop, and resets when the focused item goes away", () => {
    const { rerender } = render(<List layout="row" count={3} />);
    screen.getByRole("link", { name: "Item 2" }).focus();
    rerender(<List layout="row" count={5} />);
    expect(tabStops()).toEqual(["Item 2"]);
    rerender(<List layout="row" count={2} />);
    expect(tabStops()).toEqual(["Item 0"]);
  });

  it("leaves modified arrows to the browser", () => {
    render(<List layout="row" count={3} />);
    const first = screen.getByRole("link", { name: "Item 0" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight", shiftKey: true });
    expect(first).toHaveFocus();
  });

  it("moves by the laid-out row in a grid", () => {
    render(<List layout="grid" count={6} />);
    // Two rows of three.
    screen.getAllByRole("link").forEach((link, index) => {
      Object.defineProperty(link, "offsetTop", { configurable: true, value: Math.floor(index / 3) * 100 });
    });
    const second = screen.getByRole("link", { name: "Item 1" });
    second.focus();
    fireEvent.keyDown(second, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Item 4" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    expect(second).toHaveFocus();
  });
});

function Preferred({ preferredIndex }: { preferredIndex?: number }) {
  const roving = useRovingFocus<HTMLUListElement>("row", { preferredIndex });
  return (
    <ul {...roving}>
      {[0, 1, 2].map((index) => (
        <li key={index}><a href={`#/item/${index}`} data-roving-item="">Item {index}</a></li>
      ))}
    </ul>
  );
}

describe("useRovingFocus preferredIndex", () => {
  it("starts the Tab stop at preferredIndex", () => {
    render(<Preferred preferredIndex={2} />);
    expect(tabStops()).toEqual(["Item 2"]);
  });

  it("moves the Tab stop when preferredIndex changes, without moving focus", () => {
    const { rerender } = render(<Preferred preferredIndex={1} />);
    expect(tabStops()).toEqual(["Item 1"]);
    rerender(<Preferred preferredIndex={2} />);
    expect(tabStops()).toEqual(["Item 2"]);
    expect(document.body).toHaveFocus();
  });

  it("keeps the Tab stop the user moved to when the value is unchanged", () => {
    const { rerender } = render(<Preferred preferredIndex={1} />);
    fireEvent.focus(screen.getByRole("link", { name: "Item 0" }));
    rerender(<Preferred preferredIndex={1} />);
    expect(tabStops()).toEqual(["Item 0"]);
  });
});

describe("nearestByCentre", () => {
  const boxes = [{ left: 0, width: 100 }, { left: 100, width: 100 }, { left: 200, width: 100 }];

  it("picks the box with the nearest centre", () => {
    expect(nearestByCentre(40, boxes)).toBe(0);
    expect(nearestByCentre(160, boxes)).toBe(1);
    expect(nearestByCentre(900, boxes)).toBe(2);
  });

  it("sends a tie to the left box", () => {
    expect(nearestByCentre(100, boxes)).toBe(0);
  });

  it("gives undefined for no boxes", () => {
    expect(nearestByCentre(10, [])).toBeUndefined();
  });
});

function SpatialRow({ name, count, empty }: { name: string; count: number; empty?: boolean }) {
  const roving = useRovingFocus<HTMLUListElement>("row", { spatial: true });
  return (
    <ul data-spatial-row="" aria-label={name} {...roving}>
      {Array.from({ length: empty ? 0 : count }, (_, index) => (
        <li key={index}><a href={`#/${name}/${index}`} data-roving-item="">{name}{index}</a></li>
      ))}
    </ul>
  );
}

// Each item is 100 wide, laid out left to right.
function stubBoxes() {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function box() {
    const index = Number(this.textContent?.replace(/\D+/g, "") ?? 0);
    return { left: index * 100, width: 100, top: 0, right: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

describe("useRovingFocus spatial", () => {
  it("moves Up and Down to the nearest centre, skipping empty rows", () => {
    const restore = stubBoxes();
    render(
      <main>
        <SpatialRow name="a" count={5} />
        <SpatialRow name="b" count={0} empty />
        <SpatialRow name="c" count={2} />
      </main>,
    );
    screen.getByText("a3").focus();
    expect(fireEvent.keyDown(screen.getByText("a3"), { key: "ArrowDown" })).toBe(false);
    expect(document.activeElement?.textContent).toBe("c1");
    expect(screen.getByText("c1").getAttribute("tabindex")).toBe("0");
    expect(screen.getByText("c0").getAttribute("tabindex")).toBe("-1");
    expect(fireEvent.keyDown(screen.getByText("c1"), { key: "ArrowUp" })).toBe(false);
    expect(document.activeElement?.textContent).toBe("a1");
    restore();
  });

  it("does nothing, and keeps the default, at the first row Up and the last row Down", () => {
    const restore = stubBoxes();
    render(
      <main>
        <SpatialRow name="a" count={3} />
        <SpatialRow name="c" count={3} />
      </main>,
    );
    screen.getByText("a1").focus();
    expect(fireEvent.keyDown(screen.getByText("a1"), { key: "ArrowUp" })).toBe(true);
    expect(document.activeElement?.textContent).toBe("a1");
    screen.getByText("c1").focus();
    expect(fireEvent.keyDown(screen.getByText("c1"), { key: "ArrowDown" })).toBe(true);
    expect(document.activeElement?.textContent).toBe("c1");
    restore();
  });
});

function GuardedRow() {
  const roving = useRovingFocus<HTMLUListElement>("row", { spatial: true });
  return (
    <ul data-spatial-row="" aria-label="guarded" {...roving}>
      <li><a href="#/g" data-roving-item="" onKeyDown={(event) => { if (event.key === "ArrowDown") event.preventDefault(); }}>g0</a></li>
    </ul>
  );
}

describe("useRovingFocus with a child that handles the key", () => {
  it("does not move focus when a child handler already called preventDefault", () => {
    const restore = stubBoxes();
    render(
      <main>
        <GuardedRow />
        <SpatialRow name="c" count={2} />
      </main>,
    );
    screen.getByText("g0").focus();
    fireEvent.keyDown(screen.getByText("g0"), { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("g0");
    restore();
  });
});
