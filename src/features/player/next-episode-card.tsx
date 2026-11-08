import type { NextEpisode } from "../../domain/catalog";

// "Up next" over the player: Play now or Cancel before the countdown ends.
export function NextEpisodeCard({ next, secondsLeft, onPlayNow, onCancel }: {
  next: NextEpisode;
  secondsLeft: number;
  onPlayNow(): void;
  onCancel(): void;
}) {
  const name = next.label ? `${next.label} ${next.title}` : next.title;
  return (
    <aside className="next-episode-card" aria-label="Up next">
      <p className="next-episode-title"><strong>Up next</strong> {name}</p>
      <p className="next-episode-timer" role="status">Playing in {secondsLeft} s</p>
      <div className="next-episode-actions">
        <button type="button" onClick={onPlayNow}>Play now</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </aside>
  );
}
