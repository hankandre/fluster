import { useRef } from "react";
import { Button, Dialog } from "../shared/ui";

// The "Leave Fluster?" confirmation, used only where a platform's rules ask for one (DESIGN.md 6, D14 B).
// Stay is focused; Back closes it through the Dialog's own Escape handling.
export function LeaveAppDialog({ open, onStay, onLeave }: { open: boolean; onStay(): void; onLeave(): void }) {
  const stay = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onStay}
      title="Leave Fluster?"
      role="alertdialog"
      closeOnVeil={false}
      initialFocus={stay}
      actions={
        <>
          <Button ref={stay} variant="secondary" onClick={onStay}>Stay</Button>
          <Button variant="primary" onClick={onLeave}>Leave</Button>
        </>
      }
    />
  );
}
