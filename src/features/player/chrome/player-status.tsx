// The centred status: a 64 px disc with a ring and one line of text, on a
// scrim, shown whether or not the chrome is. The ring spins; under reduced
// motion it holds still. The live region is always mounted and holds the
// visual only while there is text, so screen readers announce each spell.
export function PlayerStatus({ text }: { text?: string }) {
  return (
    <div role="status" aria-label="Player status">
      {text !== undefined && (
        <div className="player-status">
          <span className="player-status-disc" aria-hidden="true">
            <span className="player-status-ring" />
          </span>
          <span className="player-status-text">{text}</span>
        </div>
      )}
    </div>
  );
}
