import { RefreshCw } from "lucide-react";
import { BURNED_IN_COPY, type ConversionIndicator } from "./conversion-copy";

// A status, not an alert: icon and words, never colour alone. Shown for the
// whole session whenever the server converts or repackages the file.
export function ConversionChip({ indicator }: { indicator: ConversionIndicator }) {
  return (
    <p className="conversion-chip" role="status">
      <RefreshCw size={15} aria-hidden="true" />
      <span>
        {indicator.chip}
        {indicator.subtitlesBurnedIn && <small>{BURNED_IN_COPY}</small>}
      </span>
    </p>
  );
}
