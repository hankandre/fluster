import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "../../shared/ui";
import { safeReason } from "../safe-reason";
import { reportingWarningCopy } from "../error-copy";

// The card for a failed player command while playback goes on: what happened (filtered), Retry, and Back.
export function CommandErrorPanel({ message, retrying, retryLabel, onRetry, onBack }: {
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
      <p>{safeReason(message)}</p>
      <div className="player-error-actions">
        <Button variant="primary" onClick={onRetry} disabled={retrying}>
          {retrying ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
          {retryLabel}
        </Button>
        <Button variant="secondary" onClick={onBack}>Return to details</Button>
      </div>
    </div>
  );
}

// Two quiet warnings under the OSD slot: the CPU is decoding, or Jellyfin
// progress reporting is failing.
export function PlayerWarnings({ softwareDecoding, reportingWarning, serverName }: { softwareDecoding: boolean; reportingWarning?: string; serverName: string }) {
  return (
    <>
      {softwareDecoding && (
        <div className="player-cpu-warning"><AlertTriangle size={15} /> Software decoding on this CPU.</div>
      )}
      {reportingWarning && (
        <div className="player-reporting-warning"><AlertTriangle size={15} /> {reportingWarningCopy(reportingWarning, serverName)}</div>
      )}
    </>
  );
}
