import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRovingFocus } from "../../roving-focus";
import { TEXT_FIELDS, useEscapeKey } from "../../use-escape-key";
import { useCompact } from "../use-compact";
import { Button } from "./button";
import "./settings.css";

export interface SettingsSectionItem {
  id: string;
  label: string;
}

interface SettingsPageProps {
  // Names the section list for assistive technology, such as "Settings sections".
  label: string;
  sections: SettingsSectionItem[];
  value: string;
  onChange(id: string): void;
  // The selected section's panel: a SettingsSection.
  children: ReactNode;
  // "auto" follows the window width; "compact" always uses the list that opens one panel at a time (the player's
  // Settings sheet).
  form?: "auto" | "compact";
  // Called when the compact form switches between the section list and an open section, after focus has moved.
  onViewChange?(view: "list" | "section"): void;
}

const ROVING_STOP = '[data-roving-item][tabindex="0"]';

// The Settings shell (DESIGN.md 7.18). On medium and larger windows a vertical tablist sits left of the selected
// panel. On compact windows a list of sections opens one panel at a time.
export function SettingsPage(props: SettingsPageProps) {
  const compact = useCompact();
  return props.form === "compact" || compact ? <CompactSettings {...props} /> : <WideSettings {...props} />;
}

function WideSettings({ label, sections, value, onChange, children }: SettingsPageProps) {
  const base = useId();
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const panel = useRef<HTMLDivElement>(null);

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    const index = sections.findIndex((section) => section.id === value);
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(index + 1, sections.length - 1);
        break;
      case "ArrowUp":
        next = Math.max(index - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = sections.length - 1;
        break;
      case "ArrowRight":
        // Into the rows. A panel with no row control (Subtitles) keeps focus on the tab.
        panel.current?.querySelector<HTMLElement>(ROVING_STOP)?.focus();
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    const target = sections[next];
    if (!target) return;
    tabs.current.get(target.id)?.focus();
    if (target.id !== value) onChange(target.id);
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // A list in a portal reaches here through the React tree but is not inside the panel.
    const target = event.target;
    if (!(target instanceof HTMLElement) || !event.currentTarget.contains(target) || target.matches(TEXT_FIELDS)) return;
    if (target.closest('[aria-expanded="true"]')) return;
    event.preventDefault();
    tabs.current.get(value)?.focus();
  }

  return (
    <div className="settings-layout">
      <div className="settings-tabs" role="tablist" aria-orientation="vertical" aria-label={label} onKeyDown={onTabKeyDown}>
        {sections.map((section) => {
          const selected = section.id === value;
          return (
            <button
              key={section.id}
              ref={(node) => {
                if (node) tabs.current.set(section.id, node);
                else tabs.current.delete(section.id);
              }}
              id={`${base}-tab-${section.id}`}
              type="button"
              role="tab"
              className="settings-tab"
              aria-selected={selected}
              aria-controls={selected ? `${base}-panel` : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(section.id)}
            >
              {section.label}
            </button>
          );
        })}
      </div>
      <div ref={panel} className="settings-panel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`} onKeyDown={onPanelKeyDown}>
        {children}
      </div>
    </div>
  );
}

function CompactSettings({ label, sections, value, onChange, children, onViewChange }: SettingsPageProps) {
  const [open, setOpen] = useState(false);
  const list = useRovingFocus<HTMLDivElement>("column");
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  const back = useCallback(() => {
    returnFocus.current = true;
    setOpen(false);
  }, []);
  useEscapeKey(back, { enabled: open });

  // Opening a section moves focus to its heading; closing returns it to that section's button.
  useEffect(() => {
    if (open) {
      panel.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      onViewChange?.("section");
    } else if (returnFocus.current) {
      returnFocus.current = false;
      list.ref.current?.querySelector<HTMLElement>(`[data-section-id="${value}"]`)?.focus({ preventScroll: true });
      onViewChange?.("list");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on open and close only; value names the button to refocus
  }, [open]);

  if (open) {
    return (
      <div className="settings-compact">
        <div><Button variant="quiet" icon={<ChevronLeft aria-hidden="true" size={20} />} onClick={back}>Back to settings</Button></div>
        <div ref={panel} className="settings-panel">{children}</div>
      </div>
    );
  }

  return (
    <nav className="settings-compact" aria-label={label}>
      <div className="settings-sections" ref={list.ref} onKeyDown={list.onKeyDown} onFocus={list.onFocus}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className="settings-section-button"
            data-roving-item=""
            data-section-id={section.id}
            onClick={() => {
              onChange(section.id);
              setOpen(true);
            }}
          >
            <span>{section.label}</span>
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        ))}
      </div>
    </nav>
  );
}

// One panel: a heading, an optional intro, and the rows. The rows are one Tab stop; Up and Down move between them.
// `footer` follows the rows and is not part of their roving set.
export function SettingsSection({ title, intro, children, footer }: { title: string; intro?: string; children?: ReactNode; footer?: ReactNode }) {
  const roving = useRovingFocus<HTMLDivElement>("column");
  return (
    <div className="settings-section">
      <h2 className="settings-section-title" tabIndex={-1}>{title}</h2>
      {intro ? <p className="settings-intro">{intro}</p> : null}
      {children ? (
        <div className="settings-rows" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
          {children}
        </div>
      ) : null}
      {footer}
    </div>
  );
}

const RowContext = createContext<{ descriptionId: string } | undefined>(undefined);

// The id of the current row's description, for a control's aria-describedby.
export function useSettingsRow(): { descriptionId: string } {
  const row = useContext(RowContext);
  if (!row) throw new Error("useSettingsRow must be used inside SettingsRow.");
  return row;
}

interface SettingsRowProps {
  label: string;
  description?: ReactNode;
  // Read-only text on the right.
  value?: ReactNode;
  // The control on the right. A button or Picker in it becomes the whole row's hit target.
  children?: ReactNode;
  // The task that builds this row. The row shows disabled, with no control, until then.
  unavailable?: string;
  // Shows the row disabled, with no control, and this text in place of "Not available yet.". For a row that
  // exists but cannot be used, such as one the server refuses.
  unavailableReason?: string;
}

export function SettingsRow({ label, description, value, children, unavailable, unavailableReason }: SettingsRowProps) {
  const descriptionId = useId();
  if (unavailable || unavailableReason) {
    return (
      <div className="settings-row" aria-disabled="true" {...(unavailable ? { "data-unbuilt": unavailable } : {})}>
        <div className="settings-row-text">
          <span className="settings-row-label">{label}</span>
          <span className="settings-row-description">{unavailableReason ?? "Not available yet."}</span>
        </div>
      </div>
    );
  }
  return (
    <RowContext.Provider value={{ descriptionId }}>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-label">{label}</span>
          {description ? <span className="settings-row-description" id={descriptionId}>{description}</span> : null}
        </div>
        {value !== undefined ? <div className="settings-row-value">{value}</div> : null}
        {children ? <div className="settings-row-control">{children}</div> : null}
      </div>
    </RowContext.Provider>
  );
}
