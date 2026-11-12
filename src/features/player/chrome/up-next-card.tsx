import { Play } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { NextEpisode } from "../../../domain/catalog";
import { Button, CardImage } from "../../shared/ui";

// The live region speaks at most twice per countdown: on appear and at 5 s.
const SECOND_ANNOUNCEMENT_SECONDS = 5;

export function countdownText(secondsLeft: number): string {
  return secondsLeft === 1 ? "Playing in 1 second" : `Playing in ${secondsLeft} seconds`;
}

// Changes once per countdown, so a screen reader hears it twice at most.
export function upNextAnnouncement(title: string, secondsLeft: number, totalSeconds: number): string {
  const spoken = secondsLeft > SECOND_ANNOUNCEMENT_SECONDS ? totalSeconds : SECOND_ANNOUNCEMENT_SECONDS;
  return `Up next: ${title}, playing in ${spoken} seconds`;
}

// "Up next" over the player: the next episode's still, Play now with the
// countdown drawn as a fill, and Hide (DESIGN.md 7.15).
export function UpNextCard({ next, stillSrc, secondsLeft, totalSeconds, paused, onPlayNow, onHide }: {
  next: NextEpisode;
  stillSrc?: string;
  secondsLeft: number;
  totalSeconds: number;
  paused: boolean;
  onPlayNow(): void;
  onHide(): void;
}) {
  const text = upNextAnnouncement(next.title, secondsLeft, totalSeconds);
  // Empty on the first render, filled in an effect: the region exists before
  // its text, so the appearance is announced.
  const [announced, setAnnounced] = useState("");
  useEffect(() => setAnnounced(text), [text]);
  const poster = next.image !== undefined && next.image.itemId !== next.id;

  return (
    <aside
      className="up-next-card"
      aria-label="Up next"
      data-paused={paused || undefined}
      style={{ "--up-next-seconds": `${totalSeconds}s` } as CSSProperties}
    >
      {stillSrc ? (
        <div className="up-next-still" data-fit={poster ? "contain" : "cover"}>
          <CardImage image={next.image} src={stillSrc} />
        </div>
      ) : null}
      <p className="up-next-meta">{next.label ? `Up next · ${next.label}` : "Up next"}</p>
      <p className="up-next-title">{next.title}</p>
      <p className="up-next-countdown">{countdownText(secondsLeft)}</p>
      <span className="visually-hidden" role="status">{announced}</span>
      <div className="up-next-actions">
        <Button variant="primary" icon={<Play aria-hidden="true" />} onClick={onPlayNow}>
          <span className="up-next-fill" aria-hidden="true" />
          Play now
        </Button>
        <Button variant="quiet" onClick={onHide}>Hide</Button>
      </div>
    </aside>
  );
}
