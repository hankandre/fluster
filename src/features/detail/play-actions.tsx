import type { MouseEvent, ReactNode } from "react";
import type { ItemDetail } from "../../domain/catalog";
import { resumeTicksOf } from "../player/playable-item";
import { openPlayerFromDetail, playRoute, type PlayRoute } from "../routes";
import { positionLabel } from "./format";

// Play, or Resume and Start over when the server saved a position. Each opens
// the player for the selected version.
export function PlayActions({ item, mediaSourceId }: { item: ItemDetail; mediaSourceId: string | undefined }) {
  const resumeTicks = resumeTicksOf(item);
  const startOver: PlayRoute = { itemId: item.id, mediaSourceId, startTicks: 0 };

  if (resumeTicks === undefined) {
    return (
      <div className="detail-play">
        <PlayLink className="primary-button" route={startOver}>Play</PlayLink>
      </div>
    );
  }
  return (
    <div className="detail-play">
      <PlayLink className="primary-button" route={{ ...startOver, startTicks: resumeTicks }}>
        Resume from {positionLabel(resumeTicks)}
      </PlayLink>
      <PlayLink className="text-button" route={startOver}>Start over</PlayLink>
    </div>
  );
}

// A plain click opens the player in-app so Back can return through history.
// Modified clicks keep the browser's default, such as opening a new tab.
function PlayLink({ route, className, children }: { route: PlayRoute; className: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openPlayerFromDetail(route);
  };
  return <a className={className} href={playRoute(route)} onClick={onClick}>{children}</a>;
}
