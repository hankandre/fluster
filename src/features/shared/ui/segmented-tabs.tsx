import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "./tabs.css";

export interface TabItem {
  id: string;
  label: string;
}

interface SegmentedTabsProps {
  label: string;
  items: TabItem[];
  value: string;
  onChange(id: string): void;
  // Automatic selects on focus (cheap panels, such as seasons). Manual waits for Enter or Space.
  activation?: "automatic" | "manual";
  // Prefix for tab and panel ids; pair it with SegmentedTabPanel.
  idBase?: string;
}

function tabId(base: string, id: string): string {
  return `${base}-tab-${id}`;
}

function panelId(base: string, id: string): string {
  return `${base}-panel-${id}`;
}

// Tabs with a roving tabindex (ARIA APG). Left and Right wrap; Home and End jump.
export function SegmentedTabs({ label, items, value, onChange, activation = "automatic", idBase }: SegmentedTabsProps) {
  const generated = useId();
  const base = idBase ?? generated;
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const stop = items.some((item) => item.id === focused) ? focused : value;

  function move(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || items.length === 0) return;
    const from = event.target instanceof HTMLElement ? event.target.closest("[data-tab-id]")?.getAttribute("data-tab-id") : null;
    const index = items.findIndex((item) => item.id === from);
    if (index < 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % items.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const item = items[next];
    setFocused(item.id);
    refs.current.get(item.id)?.focus();
    if (activation === "automatic") onChange(item.id);
  }

  return (
    <div className="ui-tabs" role="tablist" aria-label={label} onKeyDown={move}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) refs.current.set(item.id, node);
              else refs.current.delete(item.id);
            }}
            id={tabId(base, item.id)}
            type="button"
            role="tab"
            data-tab-id={item.id}
            className="ui-tab"
            aria-selected={selected}
            aria-controls={panelId(base, item.id)}
            tabIndex={item.id === stop ? 0 : -1}
            onFocus={() => setFocused(item.id)}
            onBlur={() => setFocused(undefined)}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// The panel a tab controls. Render it for the selected tab only.
export function SegmentedTabPanel({ idBase, id, children }: { idBase: string; id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={panelId(idBase, id)} aria-labelledby={tabId(idBase, id)} tabIndex={0}>
      {children}
    </div>
  );
}
