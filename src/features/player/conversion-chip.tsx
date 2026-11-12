import { RefreshCw } from "lucide-react";
import { BURNED_IN_COPY, type ConversionIndicator } from "./conversion-copy";

// Icon and words, never colour alone. Shown in the top bar whenever the server
// converts or repackages the file; it opens the Info sheet. The OSD line and
// the loading text announce the conversion, so this is not a live region.
export function ConversionChip({ indicator, onOpen }: { indicator: ConversionIndicator; onOpen(): void }) {
  return (
    <button type="button" className="conversion-chip" onClick={onOpen}>
      <RefreshCw size={15} aria-hidden="true" />
      <span>
        {indicator.chip}
        {indicator.subtitlesBurnedIn && <small>{BURNED_IN_COPY}</small>}
      </span>
    </button>
  );
}
