import { useMemo } from "react";
import { Button } from "../../shared/ui";
import { blurhashToDataUrl } from "../../home/blurhash";
import { ArrowLeft } from "lucide-react";
import { PlayerStatus } from "./player-status";

export interface LoadingBackdrop {
  src?: string;
  blurHash?: string;
}

// Shown until the first frame: the item's backdrop at 40% over the void, the
// title, one line saying what is happening, and Back. No controls are drawn.
export function PlayerLoading({ title, seriesLine, backdrop, text, onBack }: {
  title: string;
  seriesLine?: string;
  backdrop?: LoadingBackdrop;
  text: string;
  onBack(): void;
}) {
  const placeholder = useMemo(() => (backdrop?.blurHash ? blurhashToDataUrl(backdrop.blurHash) : undefined), [backdrop?.blurHash]);
  return (
    <div className="player-loading">
      <div className="player-loading-art" style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}>
        {backdrop?.src && <img src={backdrop.src} alt="" />}
      </div>
      <div className="player-loading-top" data-chrome-zone="">
        <Button variant="icon" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={21} aria-hidden="true" />
        </Button>
        <div className="player-title">
          {seriesLine && <p>{seriesLine}</p>}
          <h1>{title}</h1>
        </div>
      </div>
      <PlayerStatus text={text} />
    </div>
  );
}
