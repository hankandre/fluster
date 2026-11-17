import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

afterEach(cleanup);

function Harness({ onChange = vi.fn(), initial = false, ...rest }: { onChange?(checked: boolean): void; initial?: boolean; describedBy?: string; rovingItem?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      label="Play next episode automatically"
      checked={checked}
      onCheckedChange={(value) => {
        setChecked(value);
        onChange(value);
      }}
      {...rest}
    />
  );
}

describe("Switch", () => {
  it("is a switch with a stable name, aria-checked, and visible On or Off", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const control = screen.getByRole("switch", { name: "Play next episode automatically" });
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(control).toHaveTextContent("Off");
    await user.click(control);
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(control).toHaveTextContent("On");
    expect(screen.getByRole("switch", { name: "Play next episode automatically" })).toBe(control);
  });

  it("toggles once on a click, on Enter, and on Space", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial />);
    const control = screen.getByRole("switch");
    await user.click(control);
    expect(onChange).toHaveBeenLastCalledWith(false);
    control.focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(true);
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("passes aria-describedby and marks a roving item only when asked", () => {
    const { rerender } = render(<Harness describedBy="d1" />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-describedby", "d1");
    expect(screen.getByRole("switch")).not.toHaveAttribute("data-roving-item");
    rerender(<Harness rovingItem />);
    expect(screen.getByRole("switch")).toHaveAttribute("data-roving-item");
  });
});
