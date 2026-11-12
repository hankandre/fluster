import { AlertTriangle, LoaderCircle } from "lucide-react";

// The panel for a playback error: what happened (already redacted), Retry, and Back.
export function PlayerErrorPanel({ message, retrying, retryLabel, onRetry, onBack }: {
  message: string;
  retrying?: boolean;
  retryLabel: string;
  onRetry(): void;
  onBack(): void;
}) {
  return (
    <div className="player-error-panel">
      <AlertTriangle size={26} />
      <h2>Playback could not start</h2>
      <p>{message}</p>
      <div className="player-error-actions">
        <button onClick={onRetry} disabled={retrying}>
          {retrying ? <LoaderCircle className="spin" size={17} /> : null}
          {retryLabel}
        </button>
        <button onClick={onBack}>Back to library</button>
      </div>
    </div>
  );
}

// Two quiet warnings under the OSD slot: the CPU is decoding, or Jellyfin
// progress reporting is failing.
export function PlayerWarnings({ softwareDecoding, reportingWarning }: { softwareDecoding: boolean; reportingWarning?: string }) {
  return (
    <>
      {softwareDecoding && (
        <div className="player-cpu-warning"><AlertTriangle size={15} /> Software decoding on this CPU.</div>
      )}
      {reportingWarning && (
        <div className="player-reporting-warning"><AlertTriangle size={15} /> Jellyfin progress reporting failed: {reportingWarning}</div>
      )}
    </>
  );
}
