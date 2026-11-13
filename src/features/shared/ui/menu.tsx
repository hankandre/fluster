import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useTvForm } from "../use-tv-form";
import { useAnchoredPlace } from "./anchored-place";
import { buttonClass } from "./button";
import { DIALOG_EXEMPT_ATTRIBUTE } from "./dialog";
import { enabledIndex, typeaheadIndex } from "./picker";
import "./picker.css";
import "./menu.css";

export interface MenuItem {
  // React key only; never shown.
  id: string;
  label: string;
  // A second line, as in Picker rows.
  description?: string;
  disabled?: boolean;
  // Set (true or false) only on rows that mark the current choice, such as the active account (DESIGN.md 7.21).
  // Such rows are menuitemradio with aria-checked and show the check. Rows without it are plain menuitem.
  checked?: boolean;
  onSelect(): void;
}

type MenuProps = {
  // The trigger's text (pill) or accessible name (icon), and the menu's name.
  label: string;
  items: MenuItem[];
  disabled?: boolean;
  // Makes the trigger an item of the surrounding roving row.
  rovingItem?: boolean;
  // False leaves ArrowUp and ArrowDown on the closed trigger to the surrounding column. Enter and Space still open it.
  openOnArrow?: boolean;
} & ({ appearance: "icon"; icon: ReactNode } | { appearance?: "pill"; icon?: ReactNode });

const TYPEAHEAD_RESET_MS = 700;

// A menu button that opens a list of actions (ARIA APG menu button). Focus moves onto the rows while open;
// Escape closes and returns focus to the trigger.
export function Menu({ label, items, disabled, rovingItem, openOnArrow = true, appearance = "pill", icon }: MenuProps) {
  const id = useId();
  const triggerId = `${id}-trigger`;
  const menuId = `${id}-menu`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const typed = useRef({ text: "", timer: 0 });
  const tv = useTvForm();
  const place = useAnchoredPlace(open, tv, trigger, list);
  const showCheck = items.some((item) => item.checked !== undefined);

  useEffect(() => {
    if (open) rowRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    const timer = typed.current;
    return () => window.clearTimeout(timer.timer);
  }, []);

  function openAt(index: number | undefined) {
    if (index === undefined) return;
    setActive(index);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  // Closes and refocuses the trigger before the action runs, so an action that opens a dialog or moves focus wins.
  function activate(index: number) {
    const item = items[index];
    if (!item || item.disabled) return;
    close(true);
    item.onSelect();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!openOnArrow) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openAt(enabledIndex(items, 0, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openAt(enabledIndex(items, items.length - 1, -1));
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => enabledIndex(items, current + 1, 1) ?? current);
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((current) => enabledIndex(items, current - 1, -1) ?? current);
        return;
      case "Home":
        event.preventDefault();
        setActive((current) => enabledIndex(items, 0, 1) ?? current);
        return;
      case "End":
        event.preventDefault();
        setActive((current) => enabledIndex(items, items.length - 1, -1) ?? current);
        return;
      case "ArrowLeft":
      case "ArrowRight":
        // No submenus; a surrounding roving row or the TV arrow fallback must not act on these.
        event.preventDefault();
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        activate(active);
        return;
      case "Escape":
        // Closes only this menu, not a dialog or page behind it.
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
          const match = typeaheadIndex(items, active, state.text);
          if (match !== undefined) setActive(match);
        }
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (open && !root.current?.contains(next) && !list.current?.contains(next)) setOpen(false);
  }

  const isIcon = appearance === "icon";
  const wrapperClass = isIcon ? "ui-menu" : "ui-picker ui-picker--pill";

  return (
    <div className={wrapperClass} ref={root} onBlur={onBlur}>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        className={isIcon ? buttonClass("icon") : "ui-picker-trigger"}
        aria-label={isIcon ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        {...(rovingItem ? { "data-roving-item": "" } : {})}
        onClick={() => (open ? close(false) : openAt(enabledIndex(items, 0, 1)))}
        onKeyDown={onTriggerKeyDown}
      >
        {isIcon ? icon : (
          <>
            {icon}
            <span className="ui-picker-value">{label}</span>
            <ChevronDown aria-hidden="true" size={18} />
          </>
        )}
      </button>
      {open ? createPortal(
        <ul
          ref={list}
          id={menuId}
          className={tv ? "ui-picker-list ui-picker-list--sheet" : "ui-picker-list"}
          role="menu"
          aria-labelledby={triggerId}
          style={place}
          onKeyDown={onListKeyDown}
          {...{ [DIALOG_EXEMPT_ATTRIBUTE]: "" }}
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              ref={(node) => { rowRefs.current[index] = node; }}
              role={item.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={item.checked}
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              className="ui-picker-option"
              onClick={() => activate(index)}
              onFocus={() => setActive(index)}
            >
              {showCheck ? (
                <span className="ui-picker-check">
                  {item.checked ? <Check aria-hidden="true" size={18} strokeWidth={2.5} /> : null}
                </span>
              ) : null}
              <span className="ui-picker-text">
                <span className="ui-picker-label">{item.label}</span>
                {item.description ? <span className="ui-picker-description">{item.description}</span> : null}
              </span>
            </li>
          ))}
        </ul>,
        document.body,
      ) : null}
    </div>
  );
}
