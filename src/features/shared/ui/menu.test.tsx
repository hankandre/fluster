import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";
import { Menu, type MenuItem } from "./menu";

function makeItems(): { items: MenuItem[]; picks: Record<string, ReturnType<typeof vi.fn>> } {
  const picks = { files: vi.fn(), series: vi.fn(), season: vi.fn(), last: vi.fn() };
  const items: MenuItem[] = [
    { id: "files", label: "File and streams", onSelect: picks.files },
    { id: "series", label: "Go to series", description: "Harbor Lights", onSelect: picks.series },
    { id: "season", label: "Mark season watched", disabled: true, onSelect: picks.season },
    { id: "last", label: "Share", onSelect: picks.last },
  ];
  return { items, picks };
}

function Harness({ items, ...rest }: { items: MenuItem[] } & Partial<React.ComponentProps<typeof Menu>>) {
  return (
    <>
      <button type="button">Before</button>
      <Menu label="More" items={items} {...(rest as object)} />
      <button type="button">After</button>
    </>
  );
}

const trigger = () => screen.getByRole("button", { name: "More" });

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.form;
});

describe("Menu", () => {
  it("renders a menu button and no native control", async () => {
    const { items } = makeItems();
    const { container } = render(<Harness items={items} />);
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector("select, input")).toBeNull();
    expect(document.body.querySelector("select, input")).toBeNull();
  });

  it("opens with Enter at the first enabled item and names the menu by the trigger", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    render(<Harness items={items} />);
    trigger().focus();
    await user.keyboard("{Enter}");
    const menu = screen.getByRole("menu", { name: "More" });
    expect(trigger()).toHaveAttribute("aria-controls", menu.id);
    expect(screen.getByRole("menuitem", { name: "File and streams" })).toHaveFocus();
  });

  it("opens with Space, ArrowDown at the first item, and ArrowUp at the last", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    render(<Harness items={items} />);
    trigger().focus();
    await user.keyboard(" ");
    expect(screen.getByRole("menuitem", { name: "File and streams" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "File and streams" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Share" })).toHaveFocus();
  });

  it("leaves the arrows alone with openOnArrow false but still opens on Enter", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    render(<Harness items={items} openOnArrow={false} />);
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.queryByRole("menu")).toBeNull();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("does not open when no item is enabled", async () => {
    const user = userEvent.setup();
    render(<Harness items={[{ id: "a", label: "A", disabled: true, onSelect: vi.fn() }]} />);
    await user.click(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("skips disabled items, stops at the ends, and jumps with Home and End", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    render(<Harness items={items} />);
    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Go to series/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Share" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Share" })).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "File and streams" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Share" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "File and streams" })).toHaveFocus();
  });

  it("activates with Enter and with Space, once, and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const { items, picks } = makeItems();
    render(<Harness items={items} />);
    trigger().focus();
    await user.keyboard("{Enter}{Enter}");
    expect(picks.files).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();
    await user.keyboard("{Enter}{ArrowDown} ");
    expect(picks.series).toHaveBeenCalledTimes(1);
    expect(trigger()).toHaveFocus();
  });

  it("lets an onSelect that moves focus keep it", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    items[0].onSelect = () => screen.getByRole("button", { name: "After" }).focus();
    render(<Harness items={items} />);
    trigger().focus();
    await user.keyboard("{Enter}{Enter}");
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("closes on Escape without selecting, returns focus, and cancels the event", async () => {
    const user = userEvent.setup();
    const { items, picks } = makeItems();
    render(<Harness items={items} />);
    trigger().focus();
    await user.keyboard("{Enter}");
    const row = screen.getByRole("menuitem", { name: "File and streams" });
    expect(fireEvent.keyDown(row, { key: "Escape" })).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(picks.files).not.toHaveBeenCalled();
  });

  it("closes only the menu when opened inside a Dialog", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    const onClose = vi.fn();
    render(
      <Dialog open title="Dialog" onClose={onClose}>
        <Menu label="More" items={items} />
      </Dialog>,
    );
    await user.click(trigger());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Tab and focus moves on", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    render(<Harness items={items} />);
    trigger().focus();
    await user.keyboard("{Enter}{Tab}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("activates on click and closes on an outside click without selecting", async () => {
    const user = userEvent.setup();
    const { items, picks } = makeItems();
    render(<Harness items={items} />);
    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: /Go to series/ }));
    expect(picks.series).toHaveBeenCalledTimes(1);
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "After" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(picks.files).not.toHaveBeenCalled();
  });

  it("ignores a disabled item", async () => {
    const user = userEvent.setup();
    const { items, picks } = makeItems();
    render(<Harness items={items} />);
    await user.click(trigger());
    const disabled = screen.getByRole("menuitem", { name: "Mark season watched" });
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    await user.click(disabled);
    expect(picks.season).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("jumps by typed label and shows a second line", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    render(<Harness items={items} />);
    trigger().focus();
    await user.keyboard("{Enter}g");
    expect(screen.getByRole("menuitem", { name: /Go to series/ })).toHaveFocus();
    expect(screen.getByText("Harbor Lights")).toBeInTheDocument();
  });

  it("marks the current choice with menuitemradio and a check only when items define checked", async () => {
    const user = userEvent.setup();
    const items: MenuItem[] = [
      { id: "a", label: "Sam", checked: true, onSelect: vi.fn() },
      { id: "b", label: "Alex", checked: false, onSelect: vi.fn() },
      { id: "c", label: "Add account", onSelect: vi.fn() },
    ];
    const { rerender } = render(<Menu label="More" items={items} />);
    await user.click(trigger());
    expect(screen.getByRole("menuitemradio", { name: "Sam" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Alex" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitem", { name: "Add account" })).not.toHaveAttribute("aria-checked");
    expect(document.querySelectorAll(".ui-picker-check svg")).toHaveLength(1);
    await user.keyboard("{Escape}");
    rerender(<Menu label="More" items={makeItems().items} />);
    await user.click(trigger());
    expect(document.querySelector(".ui-picker-check")).toBeNull();
  });

  it("renders an icon trigger named by the label, without a chevron", () => {
    const { items } = makeItems();
    const { rerender } = render(<Menu appearance="icon" icon={<span>S</span>} label="Account" items={items} />);
    const button = screen.getByRole("button", { name: "Account" });
    expect(button).toHaveClass("ui-button--icon");
    expect(button.querySelector("svg")).toBeNull();
    expect(button).not.toHaveAttribute("data-roving-item");
    rerender(<Menu appearance="icon" icon={<span>S</span>} label="Account" items={items} rovingItem />);
    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute("data-roving-item");
  });

  it("does not open when the trigger is disabled", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    render(<Harness items={items} disabled />);
    await user.click(trigger());
    trigger().focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("anchors the list on desktop", async () => {
    const user = userEvent.setup();
    const { items } = makeItems();
    render(<Harness items={items} />);
    await user.click(trigger());
    const menu = screen.getByRole("menu");
    expect(menu).not.toHaveClass("ui-picker-list--sheet");
    expect(menu.style.top).not.toBe("");
    expect(menu.style.left).not.toBe("");
  });

  it("opens as a right-side sheet in the TV form with the same keys", async () => {
    document.documentElement.dataset.form = "tv";
    const user = userEvent.setup();
    const { items, picks } = makeItems();
    render(<Harness items={items} />);
    await user.click(trigger());
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("ui-picker-list--sheet");
    expect(menu.style.top).toBe("");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(picks.series).toHaveBeenCalledTimes(1);
    expect(trigger()).toHaveFocus();
    await user.keyboard("{Enter}{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();
  });
});
