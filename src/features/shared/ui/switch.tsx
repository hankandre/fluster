import type { ComponentProps } from "react";
import "./controls.css";

type NativeButton = Omit<ComponentProps<"button">, "className" | "style" | "onClick" | "role" | "aria-checked" | "aria-label" | "children" | "type" | "aria-describedby">;

interface SwitchProps extends NativeButton {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  // The accessible name. It never changes with the state; aria-checked and the visible On or Off show it.
  label: string;
  // The id of text that describes the switch, such as a row's description.
  describedBy?: string;
  // Makes the switch an item of the surrounding roving row.
  rovingItem?: boolean;
}

// An on/off setting (DESIGN.md 7.18, WAI-ARIA APG switch). A button with role="switch": Space and Enter toggle it.
// State is never colour alone: the thumb moves and the words On or Off show beside the track.
export function Switch({ checked, onCheckedChange, label, describedBy, rovingItem, ...rest }: SwitchProps) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      className="ui-switch"
      onClick={() => onCheckedChange(!checked)}
      {...(rovingItem ? { "data-roving-item": "" } : {})}
    >
      <span className="ui-switch-state" aria-hidden="true">{checked ? "On" : "Off"}</span>
      <span className="ui-switch-track" aria-hidden="true">
        <span className="ui-switch-thumb" />
      </span>
    </button>
  );
}
