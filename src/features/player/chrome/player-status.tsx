// The centred status: a 64 px disc with a ring and one line of text, on a
// scrim, shown whether or not the chrome is. The ring spins; under reduced
// motion it holds still and pulses.
export function PlayerStatus({ text }: { text: string }) {
  return (
    <div className="player-status" role="status" aria-label="Player status">
      <span className="player-status-disc" aria-hidden="true">
        <span className="player-status-ring" />
      </span>
      <span className="player-status-text">{text}</span>
    </div>
  );
}
