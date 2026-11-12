import { ArrowLeft } from "lucide-react";
import type { LibraryItem } from "../../../domain/catalog";
import { Button } from "../../shared/ui";
import { ConversionChip } from "../conversion-chip";
import type { ConversionIndicator } from "../conversion-copy";

// "S1 · E2 The Keeper's Log" when both numbers are known, else the name.
export function titleLine(item: LibraryItem): string {
  if (item.type === "Episode" && item.season != null && item.episode != null) {
    return `S${item.season} · E${item.episode} ${item.name}`;
  }
  return item.name;
}

// Back, the title block (the series name above an episode's title), and on the
// right the conversion chip when the server converts. Its background is the
// top scrim.
export function PlayerTopBar({ item, indicator, onBack, onOpenInfo }: {
  item: LibraryItem;
  indicator?: ConversionIndicator;
  onBack(): void;
  onOpenInfo(): void;
}) {
  return (
    <header className="player-top-bar" data-chrome-zone="">
      <Button variant="icon" aria-label="Back" onClick={onBack}>
        <ArrowLeft size={21} aria-hidden="true" />
      </Button>
      <div className="player-title">
        {item.type === "Episode" && item.seriesName && <p>{item.seriesName}</p>}
        <h1>{titleLine(item)}</h1>
      </div>
      {indicator && <ConversionChip indicator={indicator} onOpen={onOpenInfo} />}
    </header>
  );
}
