import { RefreshCw } from "lucide-react";
import type { OsdMessage } from "./use-osd";

// A transient pill at top centre for key actions and the conversion line. The
// live region stays mounted and empty between messages so it announces each
// one. It never takes focus or pointer events.
export function Osd({ message }: { message: OsdMessage | undefined }) {
  return (
    <div className="player-osd" role="status" aria-label="Player message" data-kind={message?.kind}>
      {message && (
        <p key={message.serial} className="player-osd-pill">
          {message.kind === "notice" && <RefreshCw size={15} aria-hidden="true" />}
          <span>{message.text}</span>
        </p>
      )}
    </div>
  );
}
