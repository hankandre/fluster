import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useRovingFocus } from "../../roving-focus";
import { SegmentedTabPanel, SegmentedTabs } from "./segmented-tabs";

const ITEMS = [
  { id: "s1", label: "Season 1" },
  { id: "s2", label: "Season 2" },
  { id: "sp", label: "Specials" },
];

function Harness({ activation }: { activation?: "automatic" | "manual" }) {
  const [value, setValue] = useState("s1");
  return (
    <>
      <button type="button">Before</button>
      <SegmentedTabs label="Seasons" items={ITEMS} value={value} onChange={setValue} activation={activation} idBase="seasons" />
      <SegmentedTabPanel idBase="seasons" id={value}>Panel for {value}</SegmentedTabPanel>
    </>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

afterEach(cleanup);

describe("SegmentedTabs", () => {
  it("is one Tab stop on the selected tab (roving tabindex)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(tab("Season 1")).toHaveAttribute("tabindex", "0");
    expect(tab("Season 2")).toHaveAttribute("tabindex", "-1");
    await user.tab();
    await user.tab();
    expect(tab("Season 1")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("tabpanel")).toHaveFocus();
  });

  it("moves and selects with arrows, wrapping at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab("Season 1").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Season 2")).toHaveFocus();
    expect(tab("Season 2")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(tab("Season 1")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(tab("Specials")).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel for sp");
  });

  it("jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab("Season 1").focus();
    await user.keyboard("{End}");
    expect(tab("Specials")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tab("Season 1")).toHaveFocus();
  });

  it("with manual activation, arrows move focus and Enter or Space selects", async () => {
    const user = userEvent.setup();
    render(<Harness activation="manual" />);
    tab("Season 1").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Season 2")).toHaveFocus();
    expect(tab("Season 1")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(tab("Season 2")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight} ");
    expect(tab("Specials")).toHaveAttribute("aria-selected", "true");
  });

  it("leaves Escape alone and keeps focus on the tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab("Season 1").focus();
    await user.keyboard("{Escape}");
    expect(tab("Season 1")).toHaveFocus();
  });

  it("returns the Tab stop to the selected tab after focus leaves", async () => {
    const user = userEvent.setup();
    render(<Harness activation="manual" />);
    tab("Season 1").focus();
    await user.keyboard("{ArrowRight}");
    await user.tab();
    await user.tab({ shift: true });
    expect(tab("Season 1")).toHaveFocus();
  });

  it("selects by click and links tabs to panels", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(tab("Specials"));
    expect(tab("Specials")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Specials" })).toBeInTheDocument();
    expect(tab("Specials")).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
    // A tab whose panel is not rendered does not point at it.
    expect(tab("Season 1")).not.toHaveAttribute("aria-controls");
  });

  describe("spatial", () => {
    function LinkRow({ href, name }: { href: string; name: string }) {
      const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
      return (
        <div data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
          <a href={href} data-roving-item="">{name}</a>
        </div>
      );
    }

    function SpatialHarness() {
      const [value, setValue] = useState("s1");
      return (
        <main>
          <LinkRow href="#/above" name="Above" />
          <SegmentedTabs label="Seasons" items={ITEMS} value={value} onChange={setValue} spatial idBase="seasons" />
          <LinkRow href="#/below" name="Below" />
        </main>
      );
    }

    it("makes only the selected tab a target of the tablist's spatial row", () => {
      render(<SpatialHarness />);
      expect(screen.getByRole("tablist")).toHaveAttribute("data-spatial-row");
      expect(tab("Season 1")).toHaveAttribute("data-roving-item");
      expect(tab("Season 2")).not.toHaveAttribute("data-roving-item");
      expect(tab("Specials")).not.toHaveAttribute("data-roving-item");
    });

    it("moves Down and Up between the tab and the rows around it, and still selects with Left and Right", async () => {
      const user = userEvent.setup();
      render(<SpatialHarness />);
      tab("Season 1").focus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("link", { name: "Below" })).toHaveFocus();
      await user.keyboard("{ArrowUp}");
      expect(tab("Season 1")).toHaveFocus();
      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("link", { name: "Above" })).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(tab("Season 1")).toHaveFocus();
      await user.keyboard("{ArrowRight}");
      expect(tab("Season 2")).toHaveFocus();
      expect(tab("Season 2")).toHaveAttribute("aria-selected", "true");
      expect(tab("Season 2")).toHaveAttribute("data-roving-item");
      expect(tab("Season 1")).not.toHaveAttribute("data-roving-item");
    });

    it("does not join the spatial rows without the prop", () => {
      render(<Harness />);
      expect(screen.getByRole("tablist")).not.toHaveAttribute("data-spatial-row");
      expect(tab("Season 1")).not.toHaveAttribute("data-roving-item");
    });
  });
});
