import type { KeyboardEvent, Ref } from "react";
import { Search, X } from "lucide-react";
import { Button } from "./button";
import "./search.css";

export interface SearchFieldProps {
  id: string;
  label: string;
  value: string;
  // The id of the suggestion list this field controls.
  listId: string;
  expanded: boolean;
  activeDescendant?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange(value: string): void;
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
  onBlur?(): void;
  onClear(): void;
}

// The large search field (DESIGN.md 7.13): a combobox input with a search icon and a clear button.
// It owns no query; the caller supplies the combobox state.
export function SearchField({ id, label, value, listId, expanded, activeDescendant, inputRef, onChange, onKeyDown, onBlur, onClear }: SearchFieldProps) {
  return (
    // The wrapper is a spatial row so Up from the first result row reaches the input. It takes no roving keys:
    // those would take Left and Right from the text caret.
    <div className="ui-search-field" data-spatial-row="">
      <label htmlFor={id} className="ui-search-field-label">{label}</label>
      <div className="ui-search-field-control">
        <Search className="ui-search-field-icon" aria-hidden="true" />
        <input
          id={id}
          ref={inputRef}
          className="ui-search-field-input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={activeDescendant}
          data-search-field=""
          data-roving-item=""
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        {value ? (
          <Button variant="icon" aria-label="Clear search" onClick={onClear}>
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
