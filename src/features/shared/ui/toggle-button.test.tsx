import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Circle, CircleCheck } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToggleButton } from "./toggle-button";

afterEach(cleanup);

function Harness({ onChange = vi.fn() }: { onChange?(pressed: boolean): void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <ToggleButton
      label="Watched"
      pressed={pressed}
      iconOff={Circle}
      iconOn={CircleCheck}
      onPressedChange={(value) => { setPressed(value); onChange(value); }}
    />
  );
}

describe("ToggleButton", () => {
  it("keeps its name, flips aria-pressed, and swaps the icon marker", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Watched" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("data-icon", "off");
    await user.click(button);
    expect(screen.getByRole("button", { name: "Watched" })).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-icon", "on");
  });

  it("toggles with Enter and Space and reports the new value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    screen.getByRole("button", { name: "Watched" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("fills the icon only when on and filledWhenOn", () => {
    const { container, rerender } = render(
      <ToggleButton label="Favorite" pressed iconOff={Circle} iconOn={Circle} filledWhenOn onPressedChange={vi.fn()} />,
    );
    expect(container.querySelector("svg")).toHaveAttribute("fill", "currentColor");
    rerender(<ToggleButton label="Favorite" pressed={false} iconOff={Circle} iconOn={Circle} filledWhenOn onPressedChange={vi.fn()} />);
    expect(container.querySelector("svg")).toHaveAttribute("fill", "none");
  });
});
