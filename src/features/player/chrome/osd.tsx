import { RefreshCw } from "lucide-react";
import type { OsdMessage } from "./use-osd";

function Pill({ message }: { message: OsdMessage }) {
  return (
    <p key={message.serial} className="player-osd-pill" data-kind={message.kind}>
      {message.kind === "notice" && <RefreshCw size={15} aria-hidden="true" />}
      <span>{message.text}</span>
    </p>
  );
}

// A transient pill at top centre for key actions and the conversion line. The
// conversion line sits above the key pill, so both can show at once. The live
// region stays mounted and empty between messages so it announces each one.
// It never takes focus or pointer events.
export function Osd({ notice, keyMessage }: { notice?: OsdMessage; keyMessage?: OsdMessage }) {
  const kind = notice ? notice.kind : keyMessage?.kind;
  return (
    <div className="player-osd" role="status" aria-label="Player message" data-kind={kind}>
      {notice && <Pill key={notice.serial} message={notice} />}
      {keyMessage && <Pill key={keyMessage.serial} message={keyMessage} />}
    </div>
  );
}
