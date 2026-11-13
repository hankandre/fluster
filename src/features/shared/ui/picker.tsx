import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useTvForm } from "../use-tv-form";
import { DIALOG_EXEMPT_ATTRIBUTE } from "./dialog";
import "./picker.css";

export interface PickerOption {
  value: string;
  label: string;
  // A second line, such as codec and channels.
  description?: string;
  disabled?: boolean;
}

interface PickerProps {
  label: string;
  // Keeps the label for assistive technology and drops it from the layout.
  hideLabel?: boolean;
  options: PickerOption[];
  value: string | undefined;
  onChange(value: string): void;
  placeholder?: string;
  disabled?: boolean;
  // "pill" is the compact trigger used in an action bar.
  appearance?: "field" | "pill";
  // Makes the trigger an item of the surrounding roving row.
  rovingItem?: boolean;
  // The id of text that describes the trigger, such as a row's description.
  describedBy?: string;
  // False leaves ArrowUp and ArrowDown on the closed trigger to the surrounding column. Enter and Space still open it.
  openOnArrow?: boolean;
}

const TYPEAHEAD_RESET_MS = 700;

function enabledIndex(options: PickerOption[], from: number, step: 1 | -1): number | undefined {
  for (let index = from; index >= 0 && index < options.length; index += step) {
    if (!options[index].disabled) return index;
  }
  return undefined;
}

// The index the typed text points at, searching on from the current option.
export function typeaheadIndex(options: PickerOption[], current: number, typed: string): number | undefined {
  const text = typed.toLowerCase();
  // One repeated letter cycles through the options that start with it.
  const cycle = text.length > 1 && [...text].every((char) => char === text[0]);
  const needle = cycle ? text[0] : text;
  const start = text.length === 1 || cycle ? current + 1 : Math.max(current, 0);
  for (let offset = 0; offset < options.length; offset += 1) {
    const index = (start + offset) % options.length;
    const option = options[index];
    if (!option.disabled && option.label.toLowerCase().startsWith(needle)) return index;
  }
  return undefined;
}

// A menu button that opens a listbox (ARIA APG). Focus moves onto the options while open;
// Escape closes and returns focus to the trigger. It never renders a native select.
export function Picker({ label, hideLabel, options, value, onChange, placeholder = "Choose", disabled, appearance = "field", rovingItem, describedBy, openOnArrow = true }: PickerProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const triggerId = `${id}-trigger`;
  const selected = options.findIndex((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const tv = useTvForm();
  const [place, setPlace] = useState<CSSProperties>({});
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const typed = useRef({ text: "", timer: 0 });

  // The list is in a portal so no scrolling or clipping ancestor (a dialog panel) cuts it off. It sits under
  // the trigger, or above it when there is more room there.
  useLayoutEffect(() => {
    if (!open || tv) return;
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const menu = list.current;
      if (!anchor || !menu) return;
      const margin = 8;
      const below = window.innerHeight - anchor.bottom - margin;
      const above = anchor.top - margin;
      const wanted = Math.min(menu.scrollHeight, 18 * parseFloat(getComputedStyle(document.documentElement).fontSize));
      const flip = wanted > below && above > below;
      const room = Math.max(flip ? above : below, 96);
      const height = Math.min(wanted, room);
      setPlace({
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - anchor.width - margin)),
        top: flip ? anchor.top - 4 - height : anchor.bottom + 4,
        minWidth: anchor.width,
        maxHeight: `min(${room}px, 18rem)`,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, tv]);

  useEffect(() => {
    if (open) optionRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    const timer = typed.current;
    return () => window.clearTimeout(timer.timer);
  }, []);

  function openAt(index: number | undefined) {
    const start = index ?? (selected >= 0 ? selected : enabledIndex(options, 0, 1));
    if (start === undefined) return;
    setActive(start);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (openOnArrow && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      if (open) return;
      openAt(undefined);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => enabledIndex(options, current + 1, 1) ?? current);
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((current) => enabledIndex(options, current - 1, -1) ?? current);
        return;
      case "Home":
        event.preventDefault();
        setActive((current) => enabledIndex(options, 0, 1) ?? current);
        return;
      case "End":
        event.preventDefault();
        setActive((current) => enabledIndex(options, options.length - 1, -1) ?? current);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        return;
      case "Escape":
        // Closes only this list, not a dialog or page behind it.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case "Tab":
        // Focus goes back to the trigger first, so Tab continues from there.
        close(true);
        return;
      default:
        if (event.key.length === 1 && !event.shiftKey) {
          const state = typed.current;
          window.clearTimeout(state.timer);
          state.text += event.key;
          state.timer = window.setTimeout(() => { state.text = ""; }, TYPEAHEAD_RESET_MS);
          const match = typeaheadIndex(options, active, state.text);
          if (match !== undefined) setActive(match);
        }
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (open && !root.current?.contains(next) && !list.current?.contains(next)) setOpen(false);
  }

  const current = selected >= 0 ? options[selected] : undefined;

  return (
    <div className={appearance === "pill" ? "ui-picker ui-picker--pill" : "ui-picker"} ref={root} onBlur={onBlur}>
      <span className={hideLabel ? "visually-hidden" : "ui-field-label"} id={labelId}>{label}</span>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        className="ui-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${triggerId}`}
        aria-describedby={describedBy}
        disabled={disabled}
        {...(rovingItem ? { "data-roving-item": "" } : {})}
        onClick={() => (open ? close(false) : openAt(undefined))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="ui-picker-value" data-placeholder={current ? undefined : "true"}>{current?.label ?? placeholder}</span>
        <ChevronDown aria-hidden="true" size={18} />
      </button>
      {open ? createPortal(
        <ul
          ref={list}
          className={tv ? "ui-picker-list ui-picker-list--sheet" : "ui-picker-list"}
          role="listbox"
          aria-labelledby={labelId}
          style={place}
          onKeyDown={onListKeyDown}
          {...{ [DIALOG_EXEMPT_ATTRIBUTE]: "" }}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node; }}
              role="option"
              tabIndex={-1}
              aria-selected={index === selected}
              aria-disabled={option.disabled || undefined}
              className="ui-picker-option"
              onClick={() => choose(index)}
              onFocus={() => setActive(index)}
            >
              <span className="ui-picker-check">
                {index === selected ? <Check aria-hidden="true" size={18} strokeWidth={2.5} /> : null}
              </span>
              <span className="ui-picker-text">
                <span className="ui-picker-label">{option.label}</span>
                {option.description ? <span className="ui-picker-description">{option.description}</span> : null}
              </span>
            </li>
          ))}
        </ul>,
        document.body,
      ) : null}
    </div>
  );
}
