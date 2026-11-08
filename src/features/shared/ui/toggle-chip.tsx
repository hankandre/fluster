import type { ComponentProps } from "react";
import { Check } from "lucide-react";
import "./controls.css";

type ToggleChipProps = Omit<ComponentProps<"button">, "className" | "style" | "onChange" | "aria-pressed"> & {
  pressed: boolean;
  onPressedChange(pressed: boolean): void;
};

// A filter chip. On state shows a check and a filled shape, not only a colour change.
export function ToggleChip({ pressed, onPressedChange, children, onClick, type = "button", ...rest }: ToggleChipProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={pressed}
      className="ui-chip"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onPressedChange(!pressed);
      }}
    >
      {pressed ? <Check aria-hidden="true" size={16} strokeWidth={2.5} /> : null}
      {children}
    </button>
  );
}
