import { useRovingFocus } from "../../roving-focus";
import { Picker, type PickerOption } from "./picker";
import { ToggleChip } from "./toggle-chip";
import "./toolbar.css";

export interface ToolbarFilter {
  value: string;
  label: string;
  pressed: boolean;
}

interface BrowseToolbarProps {
  sortOptions: PickerOption[];
  sortValue: string;
  onSortChange(value: string): void;
  filters: ToolbarFilter[];
  onFilterChange(value: string, pressed: boolean): void;
  // A ready sentence such as "248 items". Plain text, not a live region. Absent while unknown.
  count?: string;
}

// Sort, filter chips, and the item count of a library page (DESIGN.md 7.12). One Tab stop; Left and Right move
// between the controls, and Up and Down join the page's spatial rows.
export function BrowseToolbar({ sortOptions, sortValue, onSortChange, filters, onFilterChange, count }: BrowseToolbarProps) {
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  return (
    <div className="ui-toolbar-wrap">
      <div
        className="ui-toolbar"
        role="toolbar"
        aria-label="Sort and filter"
        data-spatial-row=""
        ref={roving.ref}
        onKeyDown={roving.onKeyDown}
        onFocus={roving.onFocus}
      >
        <Picker label="Sort" hideLabel appearance="pill" rovingItem options={sortOptions} value={sortValue} onChange={onSortChange} />
        <div className="ui-toolbar-filters" role="group" aria-label="Filters">
          {filters.map((filter) => (
            <ToggleChip
              key={filter.value}
              data-roving-item=""
              pressed={filter.pressed}
              onPressedChange={(pressed) => onFilterChange(filter.value, pressed)}
            >
              {filter.label}
            </ToggleChip>
          ))}
        </div>
        {count ? <p className="ui-toolbar-count">{count}</p> : null}
      </div>
    </div>
  );
}
