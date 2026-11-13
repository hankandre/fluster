import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Picker, typeaheadIndex, type PickerOption } from "./picker";

const OPTIONS: PickerOption[] = [
  { value: "none", label: "No limit" },
  { value: "20", label: "20 Mbps", description: "Good for Wi-Fi" },
  { value: "8", label: "8 Mbps", disabled: true },
  { value: "40", label: "40 Mbps" },
];

function Harness({ onChange = vi.fn() }: { onChange?(value: string): void }) {
  const [value, setValue] = useState("20");
  return (
    <>
      <button type="button">Before</button>
      <Picker label="Streaming limit" options={OPTIONS} value={value} onChange={(next) => { setValue(next); onChange(next); }} />
      <button type="button">After</button>
    </>
  );
}

const trigger = () => screen.getByRole("button", { name: /Streaming limit/ });

afterEach(cleanup);

describe("Picker", () => {
  it("shows the current value and is not a native select", () => {
    const { container } = render(<Harness />);
    expect(trigger()).toHaveTextContent("20 Mbps");
    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("select")).toBeNull();
  });

  it("opens with Enter, focuses the selected option, and marks it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Streaming limit" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /20 Mbps/ })).toHaveFocus();
    expect(screen.getByRole("option", { name: /20 Mbps/ })).toHaveAttribute("aria-selected", "true");
  });

  it("opens with Space and with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard(" ");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("leaves ArrowUp and ArrowDown to the surrounding column when openOnArrow is false, and still opens with Enter", async () => {
    const user = userEvent.setup();
    render(<Picker label="Row limit" options={OPTIONS} value="20" onChange={vi.fn()} openOnArrow={false} />);
    const button = screen.getByRole("button", { name: /Row limit/ });
    button.focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("points the trigger at the text that describes it", () => {
    render(
      <>
        <p id="hint">Servers on the internet.</p>
        <Picker label="Row limit" options={OPTIONS} value="20" onChange={vi.fn()} describedBy="hint" />
      </>,
    );
    expect(screen.getByRole("button", { name: /Row limit/ })).toHaveAccessibleDescription("Servers on the internet.");
  });

  it("moves with arrows, Home, and End, skipping disabled options", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /40 Mbps/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /40 Mbps/ })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("option", { name: "No limit" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "No limit" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("option", { name: /40 Mbps/ })).toHaveFocus();
  });

  it("selects with Enter, closes, and returns focus to the trigger", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("40");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveTextContent("40 Mbps");
  });

  it("selects with Space", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await user.keyboard("{Enter}{Home} ");
    expect(onChange).toHaveBeenCalledWith("none");
  });

  it("closes on Escape without changing and returns focus to the trigger", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveTextContent("20 Mbps");
  });

  it("jumps by typing the start of a label", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard("{Enter}n");
    expect(screen.getByRole("option", { name: "No limit" })).toHaveFocus();
  });

  it("jumps to a label that starts with a digit", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard("{Enter}4");
    expect(screen.getByRole("option", { name: /40 Mbps/ })).toHaveFocus();
  });

  it("closes on Tab and moves on from the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("selects by click and closes on an outside click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(trigger());
    await user.click(screen.getByRole("option", { name: "No limit" }));
    expect(onChange).toHaveBeenCalledWith("none");
    await user.click(trigger());
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not select a disabled option", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(trigger());
    await user.click(screen.getByRole("option", { name: "8 Mbps" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows the second line of an option", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    expect(screen.getByRole("option", { name: /Good for Wi-Fi/ })).toBeInTheDocument();
  });
});

describe("typeaheadIndex", () => {
  it("cycles a repeated letter and refines a longer prefix", () => {
    const options: PickerOption[] = [{ value: "a", label: "Alpha" }, { value: "b", label: "Able" }, { value: "c", label: "Beta" }];
    expect(typeaheadIndex(options, 0, "a")).toBe(1);
    expect(typeaheadIndex(options, 1, "a")).toBe(0);
    expect(typeaheadIndex(options, 1, "al")).toBe(0);
    expect(typeaheadIndex(options, 0, "z")).toBeUndefined();
  });
});

describe("Picker appearance and rovingItem", () => {
  it("adds the pill class only for appearance pill", () => {
    const { container, rerender } = render(<Picker label="Version" options={OPTIONS} value="20" onChange={vi.fn()} />);
    expect(container.querySelector(".ui-picker")).not.toHaveClass("ui-picker--pill");
    rerender(<Picker label="Version" appearance="pill" options={OPTIONS} value="20" onChange={vi.fn()} />);
    expect(container.querySelector(".ui-picker")).toHaveClass("ui-picker--pill");
  });

  it("puts data-roving-item on the trigger only with rovingItem", () => {
    const { rerender } = render(<Picker label="Version" options={OPTIONS} value="20" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Version/ })).not.toHaveAttribute("data-roving-item");
    rerender(<Picker label="Version" rovingItem options={OPTIONS} value="20" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Version/ })).toHaveAttribute("data-roving-item");
  });
});
