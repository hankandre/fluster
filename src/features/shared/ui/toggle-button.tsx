import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

type NativeButton = Omit<ComponentProps<"button">, "className" | "style" | "onClick" | "aria-pressed" | "children" | "type">;

interface ToggleButtonProps extends NativeButton {
  pressed: boolean;
  onPressedChange(pressed: boolean): void;
  // The name never changes with the state; the icon and aria-pressed show it (WAI-ARIA APG toggle button).
  label: string;
  iconOff: LucideIcon;
  iconOn: LucideIcon;
  // Fills the "on" icon, such as a heart.
  filledWhenOn?: boolean;
}

// A secondary button that holds a state (DESIGN.md 11.4): icon plus aria-pressed, never colour alone.
export function ToggleButton({ pressed, onPressedChange, label, iconOff, iconOn, filledWhenOn, ...rest }: ToggleButtonProps) {
  const Icon = pressed ? iconOn : iconOff;
  return (
    <button
      {...rest}
      type="button"
      aria-pressed={pressed}
      className="ui-button ui-button--secondary ui-toggle"
      data-icon={pressed ? "on" : "off"}
      onClick={() => onPressedChange(!pressed)}
    >
      <Icon aria-hidden="true" size={20} {...(pressed && filledWhenOn ? { fill: "currentColor" } : {})} />
      {label}
    </button>
  );
}
