import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import "./picker.css";

export interface OptionListOption {
  value: string;
  label: string;
  // A second line, such as codec and channels.
  description?: string;
  disabled?: boolean;
}

interface OptionListProps {
  label: string;
  options: OptionListOption[];
  value: string | undefined;
  onChange(value: string): void;
  disabled?: boolean;
}

function enabledIndex(options: OptionListOption[], from: number, step: 1 | -1): number | undefined {
  for (let index = from; index >= 0 && index < options.length; index += step) {
    if (!options[index].disabled) return index;
  }
  return undefined;
}

// An always-open list of choices, for a panel that holds several of them.
// One row is in the tab order; Up, Down, Home, and End move between rows,
// Enter or Space chooses. Rows reuse the Picker's look.
export function OptionList({ label, options, value, onChange, disabled = false }: OptionListProps) {
  const rows = useRef<Array<HTMLLIElement | null>>([]);
  const selected = options.findIndex((option) => option.value === value);
  const tabStop = selected >= 0 && !options[selected].disabled ? selected : enabledIndex(options, 0, 1);

  const move = (index: number | undefined) => {
    if (index !== undefined) rows.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(enabledIndex(options, index + 1, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        move(enabledIndex(options, index - 1, -1));
        break;
      case "Home":
        event.preventDefault();
        move(enabledIndex(options, 0, 1));
        break;
      case "End":
        event.preventDefault();
        move(enabledIndex(options, options.length - 1, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!options[index].disabled) onChange(options[index].value);
        break;
    }
  };

  return (
    <ul role="listbox" aria-label={label} aria-disabled={disabled || undefined} className="ui-option-list">
      {options.map((option, index) => {
        const inert = disabled || option.disabled;
        return (
          <li
            key={option.value}
            ref={(element) => { rows.current[index] = element; }}
            role="option"
            tabIndex={!disabled && index === tabStop ? 0 : -1}
            aria-selected={index === selected}
            aria-disabled={inert || undefined}
            className="ui-picker-option"
            onClick={() => { if (!inert) onChange(option.value); }}
            onKeyDown={(event) => { if (!disabled) onKeyDown(event, index); }}
          >
            <span className="ui-picker-check">
              {index === selected ? <Check aria-hidden="true" size={18} strokeWidth={2.5} /> : null}
            </span>
            <span className="ui-picker-text">
              <span className="ui-picker-label">{option.label}</span>
              {option.description ? <span className="ui-picker-description">{option.description}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
