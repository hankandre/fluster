import type { ItemDetail } from "../../domain/catalog";
import { resumeTicksOf } from "../player/playable-item";
import { playRoute } from "../routes";
import { positionLabel } from "./format";

// Play, or Resume and Start over when the server saved a position. Each opens
// the player for the selected version.
export function PlayActions({ item, mediaSourceId }: { item: ItemDetail; mediaSourceId: string | undefined }) {
  const resumeTicks = resumeTicksOf(item);
  const startOver = playRoute({ itemId: item.id, mediaSourceId, startTicks: 0 });

  if (resumeTicks === undefined) {
    return (
      <div className="detail-play">
        <a className="primary-button" href={startOver}>Play</a>
      </div>
    );
  }
  return (
    <div className="detail-play">
      <a className="primary-button" href={playRoute({ itemId: item.id, mediaSourceId, startTicks: resumeTicks })}>
        Resume from {positionLabel(resumeTicks)}
      </a>
      <a className="text-button" href={startOver}>Start over</a>
    </div>
  );
}
